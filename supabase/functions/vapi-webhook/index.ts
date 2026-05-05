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

// Vapi wraps payloads in { message: { type, call, ...runtimeFields } }.
// Some older integrations posted the call object at the top level.
//
// IMPORTANT: on end-of-call-report Vapi puts the runtime fields
// (endedAt, endedReason, transcript, analysis, recordingUrl, artifact)
// at MESSAGE level, NOT inside message.call. message.call only carries
// the call's static metadata (id, customer, phoneNumberId, etc.). If we
// returned message.call directly we'd land all the interesting fields
// as null. Merge message-level runtime fields onto the call object so
// buildRow finds them where it expects, preferring any value that's
// already on call (just in case a future Vapi version puts them there).
function extractCallObject(body: any): any {
  if (!body) return null
  const m = body.message
  if (m?.call) {
    return {
      ...m.call,
      startedAt:    m.call.startedAt    ?? m.startedAt    ?? null,
      endedAt:      m.call.endedAt      ?? m.endedAt      ?? null,
      endedReason:  m.call.endedReason  ?? m.endedReason  ?? null,
      analysis:     m.call.analysis     ?? m.analysis     ?? null,
      artifact:     m.call.artifact     ?? m.artifact     ?? null,
      transcript:   m.call.transcript   ?? m.transcript   ?? null,
      recordingUrl: m.call.recordingUrl ?? m.recordingUrl ?? null,
      structuredOutputs:
        m.call.structuredOutputs ?? m.structuredOutputs ?? undefined,
    }
  }
  if (body.call) return body.call
  if (body.id)   return body  // raw call object
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

// ---------- Email notification (Mailgun) ----------
//
// Fires after a successful upsert on end-of-call-report. Sends a clean
// HTML+text email to the tenant's auth email summarizing the call —
// caller, when, what they need, booked/waiting status, AI summary, and
// a deep link back to the dashboard.
//
// Failures are swallowed (logged, not thrown) so a Mailgun outage never
// drops a call from the mirror.

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c])
}

function fmtPhoneEmail(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = String(raw).replace(/\D/g, '')
  if (d.length < 10) return String(raw)
  const last10 = d.slice(-10)
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`
}

function fmtDateTimeEmail(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/Los_Angeles',
    })
  } catch { return '' }
}

function fmtDurationEmail(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return ''
  const start = new Date(startIso).getTime()
  const end   = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
  const seconds = Math.round((end - start) / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function buildEmailSubject(row: any): string {
  const name = row.customer_name || fmtPhoneEmail(row.customer_phone) || 'Unknown caller'
  if (row.appointment_booked === true) {
    const when = [row.appointment_date, row.appointment_time].filter(Boolean).join(' at ')
    return when ? `New call: ${name} · Booked ${when}` : `New call: ${name} · Booked`
  }
  return `New call: ${name}`
}

function renderCallEmailHtml(row: any, shopName: string, appUrl: string): string {
  const caller   = row.customer_name || 'Unknown caller'
  const phoneFmt = fmtPhoneEmail(row.customer_phone)
  const dateStr  = fmtDateTimeEmail(row.started_at)
  const duration = fmtDurationEmail(row.started_at, row.ended_at)
  const booked   = row.appointment_booked === true
  const apptWhen = booked ? [row.appointment_date, row.appointment_time].filter(Boolean).join(' at ') : null
  const dashUrl  = `${appUrl}/dashboard`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${escapeHtml(buildEmailSubject(row))}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0F172A; margin: 0; padding: 0; background: #F5F7FB;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 20px;">
    <div style="background: #FFFFFF; border-radius: 12px; padding: 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
      <p style="margin: 0; color: #64748B; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(shopName)}</p>
      <h1 style="margin: 8px 0 16px; font-size: 22px; line-height: 1.3; color: #0F172A;">New call from ${escapeHtml(caller)}</h1>
      ${booked
        ? `<div style="display: inline-block; background: #D1FAE5; color: #047857; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600;">✓ Booked${apptWhen ? ' · ' + escapeHtml(apptWhen) : ''}</div>`
        : `<div style="display: inline-block; background: #FEF3C7; color: #92400E; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600;">⏳ Waiting on callback</div>`}
      <table cellpadding="0" cellspacing="0" style="margin-top: 24px; width: 100%; border-collapse: collapse;">
        ${phoneFmt ? `<tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 13px; width: 90px;">Phone</td>
          <td style="padding: 6px 0; font-size: 14px;"><a href="tel:${escapeHtml(row.customer_phone || '')}" style="color: #C9791F; text-decoration: none; font-weight: 500;">${escapeHtml(phoneFmt)}</a></td>
        </tr>` : ''}
        ${dateStr ? `<tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 13px;">When</td>
          <td style="padding: 6px 0; font-size: 14px; font-weight: 500;">${escapeHtml(dateStr)}${duration ? ' · ' + escapeHtml(duration) : ''}</td>
        </tr>` : ''}
        ${row.service_type ? `<tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 13px;">Service</td>
          <td style="padding: 6px 0; font-size: 14px; font-weight: 500;">${escapeHtml(row.service_type)}</td>
        </tr>` : ''}
        ${row.problem ? `<tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 13px; vertical-align: top;">Problem</td>
          <td style="padding: 6px 0; font-size: 14px;">${escapeHtml(row.problem)}</td>
        </tr>` : ''}
      </table>
      ${row.summary ? `<div style="margin-top: 20px; padding: 16px; background: #F8FAFC; border-radius: 8px;">
        <p style="margin: 0 0 6px; color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Summary</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #334155;">${escapeHtml(row.summary)}</p>
      </div>` : ''}
      <a href="${dashUrl}" style="display: inline-block; margin-top: 24px; background: #E8952E; color: #FFFFFF; padding: 11px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Open in Dashboard →</a>
    </div>
    <p style="margin: 16px 0 0; text-align: center; color: #94A3B8; font-size: 12px;">
      Sent by <a href="${dashUrl}" style="color: #94A3B8;">Dovvia</a> · You're receiving this because you have call notifications enabled.
    </p>
  </div>
</body>
</html>`
}

function renderCallEmailText(row: any, shopName: string, appUrl: string): string {
  const caller   = row.customer_name || 'Unknown caller'
  const phoneFmt = fmtPhoneEmail(row.customer_phone)
  const dateStr  = fmtDateTimeEmail(row.started_at)
  const duration = fmtDurationEmail(row.started_at, row.ended_at)
  const booked   = row.appointment_booked === true
  const apptWhen = booked ? [row.appointment_date, row.appointment_time].filter(Boolean).join(' at ') : null
  const lines: string[] = [
    shopName.toUpperCase(),
    '',
    `New call from ${caller}`,
    booked ? `✓ Booked${apptWhen ? ` · ${apptWhen}` : ''}` : '⏳ Waiting on callback',
    '',
  ]
  if (phoneFmt)         lines.push(`Phone:    ${phoneFmt}`)
  if (dateStr)          lines.push(`When:     ${dateStr}${duration ? ` · ${duration}` : ''}`)
  if (row.service_type) lines.push(`Service:  ${row.service_type}`)
  if (row.problem)      lines.push(`Problem:  ${row.problem}`)
  if (row.summary) {
    lines.push('', 'SUMMARY', row.summary)
  }
  lines.push('', `Open in Dashboard: ${appUrl}/dashboard`)
  return lines.join('\n')
}

async function sendCallEmail(
  sb: ReturnType<typeof createClient>,
  userId: string,
  row: any,
): Promise<void> {
  const apiKey = Deno.env.get('MAILGUN_API_KEY')
  const domain = Deno.env.get('MAILGUN_DOMAIN')
  if (!apiKey || !domain) {
    console.log('[vapi-webhook] email skipped — Mailgun env vars not set')
    return
  }

  // Look up the tenant's auth email + shop name. We use auth.admin via
  // service-role; the tenant never sees this, only their own row gets
  // emailed.
  const { data: userInfo, error: userErr } = await sb.auth.admin.getUserById(userId)
  const recipient = userInfo?.user?.email
  if (userErr || !recipient) {
    console.log('[vapi-webhook] email skipped — no recipient:', userErr?.message)
    return
  }
  const { data: profile } = await sb
    .from('profiles')
    .select('shop_name')
    .eq('id', userId)
    .maybeSingle()
  const shopName = profile?.shop_name || 'Dovvia'

  const fromAddr = Deno.env.get('MAILGUN_FROM') || 'Dovvia <hi@getdovvia.com>'
  const region   = (Deno.env.get('MAILGUN_REGION') || 'us').toLowerCase()
  const apiBase  = region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
  const appUrl   = Deno.env.get('APP_URL') || 'https://app.getdovvia.com'

  const formData = new URLSearchParams()
  formData.set('from', fromAddr)
  formData.set('to', recipient)
  formData.set('subject', buildEmailSubject(row))
  formData.set('html', renderCallEmailHtml(row, shopName, appUrl))
  formData.set('text', renderCallEmailText(row, shopName, appUrl))
  formData.set('o:tag', 'call-notification')

  const r = await fetch(`${apiBase}/v3/${domain}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`api:${apiKey}`) },
    body: formData,
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    console.log('[vapi-webhook] mailgun send failed:', r.status, t.slice(0, 200))
    return
  }
  console.log('[vapi-webhook] email sent', { to: recipient.replace(/(^.).+(@.+$)/, '$1***$2') })
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

  // Diagnostic logging — surfaces in Supabase Edge Functions → Logs.
  // Lets us see whether Vapi is calling us at all and which auth-shape
  // headers (if any) it's sending. Sanitized: only first 8 chars + length.
  const allHeaderKeys = [...req.headers.keys()].sort()
  const authish = allHeaderKeys.filter(k =>
    k.startsWith('x-vapi') || k === 'authorization' || k === 'x-webhook-secret' || k === 'x-secret'
  )
  console.log('[vapi-webhook] incoming', {
    method: req.method,
    contentType: req.headers.get('content-type'),
    totalHeaders: allHeaderKeys.length,
    authish: authish.map(k => {
      const v = (req.headers.get(k) || '').trim()
      return `${k}=${v.slice(0, 8)}…(${v.length}ch)`
    }),
  })

  // Vapi sends the configured secret as the X-Vapi-Secret header (or
  // through Authorization: Bearer in some setups). Accept either.
  const headerSecret = (req.headers.get('x-vapi-secret') || '').trim()
  const auth         = (req.headers.get('authorization')  || '').trim()
  const bearer       = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const secret       = headerSecret || bearer
  if (!secret) {
    console.log('[vapi-webhook] 401 missing secret — no x-vapi-secret or bearer header found')
    return json({ ok: false, error: 'missing webhook secret' }, 401)
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Resolve tenant. We pull the row by secret, then constant-time compare
  // to avoid leaking timing info even though the secret is high-entropy.
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id, vapi_webhook_secret')
    .eq('vapi_webhook_secret', secret)
    .maybeSingle()

  if (profileErr) {
    console.log('[vapi-webhook] 500 profile lookup failed', profileErr.message)
    return json({ ok: false, error: profileErr.message }, 500)
  }
  if (!profile || !safeEqual(profile.vapi_webhook_secret, secret)) {
    console.log('[vapi-webhook] 401 secret did not match any profile (received first 8:', secret.slice(0, 8) + '…)')
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
  console.log('[vapi-webhook] auth ok', {
    user_id: userId,
    msg_type: body?.message?.type || '(unknown)',
    has_call_id: !!call?.id,
  })
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

  if (upsertErr) {
    console.log('[vapi-webhook] upsert failed', upsertErr.message)
    return json({ ok: false, error: upsertErr.message }, 500)
  }
  console.log('[vapi-webhook] upserted', {
    vapi_id: call.id,
    has_started: !!row.started_at,
    has_ended:   !!row.ended_at,
    end_reason:  row.end_reason,
  })

  // Email notification — only on end-of-call-report. Status-update fires
  // many times mid-call; we don't want N emails per call. Errors are
  // logged but never surface — the call mirror is the primary contract,
  // email is "nice to have" alongside it.
  const msgType = body?.message?.type
  if (msgType === 'end-of-call-report') {
    try {
      await sendCallEmail(sb, userId, row)
    } catch (e) {
      console.log('[vapi-webhook] email send threw:', (e as Error).message)
    }
  }

  return json({ ok: true, vapi_id: call.id })
})
