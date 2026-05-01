// One-shot Vapi → Supabase sync. Used to (a) backfill history when a tenant
// first turns on the DB mirror, and (b) plug any gaps if the live webhook
// missed a call (network blip, function cold-start, etc).
//
// Auth: requires the caller's Supabase JWT — extracted by the function
// runtime via `Authorization: Bearer <user_token>`. We resolve the user
// from that token, fetch THEIR vapi_key from profiles using a service
// client (RLS-bypass), then talk to Vapi server-side. The browser never
// sees the key during sync, only the row count when it's done.
//
// Deploy:  supabase functions deploy vapi-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const VAPI_BASE = 'https://api.vapi.ai'
// Vapi's /call endpoint returns at most a few hundred per page. We page
// through with createdAtLt cursor on the oldest result of the previous
// page until we hit `since` or run out.
const PAGE_SIZE = 100
// Hard ceiling so a misconfigured request can't run forever. 5000 calls
// covers years of history for a single shop.
const MAX_TOTAL = 5000

type CallObj = Record<string, any>

async function vapiList(apiKey: string, params: Record<string, string>): Promise<CallObj[]> {
  const url = new URL(VAPI_BASE + '/call')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Vapi ${r.status}: ${text.slice(0, 200)}`)
  }
  const data = await r.json()
  if (Array.isArray(data)) return data
  return data.results || data.calls || []
}

function pickOutputs(call: any): Record<string, unknown> {
  const a = call?.analysis?.structuredData ?? {}
  const b = call?.analysis?.structuredOutputs ?? call?.structuredOutputs ?? {}
  return { ...a, ...b }
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
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ ok: false, error: 'server not configured' }, 500)
  }

  // Resolve the calling user from their JWT. Use the anon-key client with
  // the user's bearer token so getUser() reads the auth context.
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json({ ok: false, error: 'missing user token' }, 401)
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401)
  const userId = userData.user.id

  // Service-role client for actually writing the calls table.
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('vapi_key')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr) return json({ ok: false, error: profileErr.message }, 500)
  if (!profile?.vapi_key) {
    return json({ ok: false, error: 'no Vapi key on profile' }, 400)
  }

  // Optional cursor — if the caller passes `since`, only sync calls newer
  // than that ISO timestamp. Useful for "fill the gap from last sync".
  let cursor: string | null = null
  let inserted = 0
  let pages = 0
  try {
    while (inserted < MAX_TOTAL) {
      const params: Record<string, string> = { limit: String(PAGE_SIZE) }
      if (cursor) params.createdAtLt = cursor
      const calls = await vapiList(profile.vapi_key, params)
      if (calls.length === 0) break

      const rows = calls
        .filter(c => c?.id && c.endedReason !== 'call-deleted' && !c.deletedAt)
        .map(c => buildRow(userId, c))

      if (rows.length > 0) {
        const { error: upErr } = await sb
          .from('calls')
          .upsert(rows, { onConflict: 'user_id,vapi_id' })
        if (upErr) throw new Error(upErr.message)
        inserted += rows.length
      }

      // Page back: cursor = oldest createdAt seen on this page.
      const oldest = calls
        .map(c => c.createdAt)
        .filter(Boolean)
        .sort()[0]
      if (!oldest || oldest === cursor) break  // no more progress
      cursor = oldest
      pages += 1
      if (pages > 100) break  // belt-and-suspenders cap
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message, inserted, pages }, 502)
  }

  return json({ ok: true, inserted, pages })
})
