// Receives Vapi server-webhook events (`end-of-call-report`, `status-update`,
// `transcript`, etc.) and mirrors the call into our `calls` table so the
// dashboard never has to hit Vapi from the browser.
//
// Security model
//   - Per-tenant secret: each profile.vapi_webhook_secret (32-char hex) is
//     unique. The tenant pastes it into Vapi's "Server URL" custom-headers
//     UI as `X-Vapi-Secret: <value>`. Any request without a matching
//     secret is rejected with 401 — no row touched.
//   - Service-role client: bypasses RLS so we can resolve tenant by secret
//     and write under that user's id. Browsers cannot reach this code path
//     (no service role exposed); RLS enforces read isolation.
//   - Idempotent: upsert by (user_id, vapi_id). Vapi may retry; we never
//     duplicate rows.
//
// Deploy:  supabase functions deploy vapi-webhook --no-verify-jwt
// Configure in Vapi:
//   Server URL:        https://<project>.supabase.co/functions/v1/vapi-webhook
//   Server URL Secret: <profiles.vapi_webhook_secret>
//                      (Vapi sends as X-Vapi-Secret automatically)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-vapi-secret, x-vapi-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Constant-time string compare so a secret-lookup oracle can't be built
// from response timing. Both inputs are short hex strings.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Vapi wraps payloads in { message: { type, call, ... } }. Some older
// integrations posted the call object at the top level. Accept both.
function extractCallObject(body: any): any {
  if (!body) return null
  if (body.message?.call) return body.message.call
  if (body.call)          return body.call
  if (body.id)            return body  // raw call object
  return null
}

// Normalize a structured-outputs blob into the columns we surface in the
// dashboard. Vapi puts these under analysis.structuredData and/or
// structuredOutputs depending on assistant config; we accept either.
function pickOutputs(call: any): Record<string, unknown> {
  const fromAnalysis = call?.analysis?.structuredData ?? {}
  const fromOutputs  = call?.analysis?.structuredOutputs ?? call?.structuredOutputs ?? {}
  return { ...fromAnalysis, ...fromOutputs }
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === false) return v
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim()
    if (s === 'true' || s === 'yes')  return true
    if (s === 'false' || s === 'no') return false
  }
  return null
}

function asString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Extract the columns we use in the dashboard from Vapi's call object.
// Anything we miss survives in vapi_raw, so we can re-derive later.
function buildRow(userId: string, call: any) {
  const o = pickOutputs(call)
  return {
    user_id: userId,
    vapi_id: call.id,
    vapi_created_at: call.createdAt ?? null,
    started_at:     call.startedAt ?? null,
    ended_at:       call.endedAt ?? null,

    customer_phone:   asString(o.customerPhone) ?? asString(call?.customer?.number),
    customer_name:    asString(o.customerName),
    customer_address: asString(o.customerAddress),

    end_reason:    asString(call.endedReason),
    service_type:  asString(o.serviceType),
    problem:       asString(o.problem),
    appointment_booked: asBool(o.appointmentBooked),
    appointment_date:   asString(o.appointmentDate),
    appointment_time:   asString(o.appointmentTime),
    wants_callback:     asBool(o.wantsCallback),

    summary:       asString(o.callSummary) ?? asString(call?.analysis?.summary),
    transcript:    call?.artifact?.transcript ?? null,
    recording_url: asString(call?.artifact?.recordingUrl),
    analysis:      call?.analysis ?? null,

    vapi_raw: call,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')   return json({ ok: false, error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'server not configured' }, 500)
  }

  // Vapi's "Server URL Secret" arrives as X-Vapi-Secret. Some setups
  // forward it as Authorization: Bearer instead, accept both.
  const headerSecret = (req.headers.get('x-vapi-secret') || '').trim()
  const auth         = (req.headers.get('authorization')  || '').trim()
  const bearer       = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const secret       = headerSecret || bearer
  if (!secret) return json({ ok: false, error: 'missing webhook secret' }, 401)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Resolve tenant. We pull the row by secret, then constant-time compare
  // to avoid leaking timing info even though the secret is high-entropy.
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id, vapi_webhook_secret')
    .eq('vapi_webhook_secret', secret)
    .maybeSingle()

  if (profileErr) return json({ ok: false, error: profileErr.message }, 500)
  if (!profile || !safeEqual(profile.vapi_webhook_secret, secret)) {
    return json({ ok: false, error: 'invalid secret' }, 401)
  }
  const userId: string = profile.id

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'invalid json' }, 400) }

  // We only mirror the call when we have a stable id to upsert by. Vapi
  // sends frequent partial updates (status-update, transcript chunks)
  // that we can ignore for the mirror — end-of-call-report carries the
  // full picture. Still upsert on partials when the id is present so a
  // dropped end-of-call-report doesn't lose the row entirely.
  const call = extractCallObject(body)
  if (!call?.id) {
    // Acknowledge so Vapi doesn't retry; nothing to store.
    return json({ ok: true, ignored: 'no call.id in payload' })
  }

  // Soft-deleted calls in Vapi: don't insert tombstones. If we already
  // have the row, leave it alone (operator may still want the record).
  if (call.endedReason === 'call-deleted' || call.deletedAt) {
    return json({ ok: true, ignored: 'soft-deleted' })
  }

  const row = buildRow(userId, call)

  const { error: upsertErr } = await sb
    .from('calls')
    .upsert(row, { onConflict: 'user_id,vapi_id' })

  if (upsertErr) return json({ ok: false, error: upsertErr.message }, 500)
  return json({ ok: true, vapi_id: call.id })
})
