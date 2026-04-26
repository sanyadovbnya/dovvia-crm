// Cron-triggered: scans appointments that ended yesterday and sends a review-
// request SMS via the appointment owner's Twilio account. Creates the review row
// with a unique token; the customer fills in rating + feedback by tapping the
// link in the SMS, which lands on the public /r/<token> page.
//
// Deploy: supabase functions deploy send-review-requests --no-verify-jwt
// Cron:   add a row in supabase cron, e.g. every day at 10am Pacific.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const TZ = 'America/Los_Angeles'

// How long after the appointment to ask. 24h gives the customer time to reflect
// without forgetting the experience.
const HOURS_AFTER = 24
const WINDOW_HALF_HOURS = 12  // run window of 12h covers a daily cron with margin

// Public review page hosted on the React app. Adjust if you ever rehost.
const PUBLIC_REVIEW_BASE = 'https://app.getdovvia.com/r'

type Profile = {
  id: string
  shop_name: string | null
  twilio_account_sid: string | null
  twilio_auth_token: string | null
  twilio_from_number: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function phoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  return d.length >= 10 ? (d.length === 10 ? `+1${d}` : `+${d}`) : null
}

function firstName(raw?: string | null): string {
  if (!raw) return 'there'
  return raw.trim().split(/\s+/)[0] || 'there'
}

function apptUTC(date: string, timeEnd: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = timeEnd.split(':').map(Number)
  const naive = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(naive)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const ptAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  const offset = naive.getTime() - ptAsUtc
  return new Date(naive.getTime() + offset)
}

async function sendSMS(cfg: Profile, to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = cfg.twilio_account_sid, token = cfg.twilio_auth_token, from = cfg.twilio_from_number
  if (!sid || !token || !from) return { ok: false, error: 'twilio not configured' }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const form = new URLSearchParams({ To: to, From: from, Body: body })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    return { ok: false, error: payload?.message || `Twilio ${res.status}` }
  }
  return { ok: true }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  // Pull recent completed-ish appointments. Look back ~3 days to catch ones
  // that landed in our window if cron ran late.
  const fromDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const toDate   = new Date(now.getTime() - 0 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id, user_id, customer_name, customer_phone, caller_phone, customer_email, date, time_end, status')
    .neq('status', 'cancelled')
    .gte('date', fromDate)
    .lte('date', toDate)

  if (error) {
    console.error('query failed:', error.message)
    return json({ ok: false, error: error.message }, 500)
  }

  // Pull existing reviews so we don't double-send
  const apptIds = (appts ?? []).map(a => a.id)
  let alreadyHas = new Set<string>()
  if (apptIds.length > 0) {
    const { data: existing } = await supabase
      .from('reviews')
      .select('appointment_id')
      .in('appointment_id', apptIds)
    alreadyHas = new Set((existing ?? []).map(r => r.appointment_id as string))
  }

  // Filter to ones in the "ask now" window
  type Work = { appt: any }
  const work: Work[] = []
  for (const a of appts ?? []) {
    if (alreadyHas.has(a.id)) continue
    const endAt = apptUTC(a.date, a.time_end || '18:00:00')
    const hoursSince = (now.getTime() - endAt.getTime()) / 3600_000
    if (Math.abs(hoursSince - HOURS_AFTER) <= WINDOW_HALF_HOURS) {
      work.push({ appt: a })
    }
  }

  // Group by user, fetch Twilio config + shop name
  const userIds = [...new Set(work.map(w => w.appt.user_id))]
  const profilesById = new Map<string, Profile>()
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, shop_name, twilio_account_sid, twilio_auth_token, twilio_from_number')
      .in('id', userIds)
    for (const p of profs ?? []) profilesById.set(p.id, p as Profile)
  }

  let sent = 0, unconfigured = 0, failed = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (const { appt: a } of work) {
    const cfg = profilesById.get(a.user_id)
    if (!cfg || !cfg.twilio_account_sid || !cfg.twilio_auth_token || !cfg.twilio_from_number) {
      unconfigured += 1
      continue
    }
    const to = phoneE164(a.customer_phone) || phoneE164(a.caller_phone)
    if (!to) { failed += 1; failures.push({ id: a.id, reason: 'no usable phone' }); continue }

    // Insert the review row first (with token), then send SMS that points at it.
    const { data: row, error: insErr } = await supabase
      .from('reviews')
      .insert({
        user_id: a.user_id,
        appointment_id: a.id,
        customer_name: a.customer_name,
        customer_phone: a.customer_phone,
        customer_email: a.customer_email,
        request_sent_at: new Date().toISOString(),
      })
      .select('token')
      .single()

    if (insErr || !row) { failed += 1; failures.push({ id: a.id, reason: insErr?.message || 'insert failed' }); continue }

    const link = `${PUBLIC_REVIEW_BASE}/${row.token}`
    const shop = cfg.shop_name || 'Your repair shop'
    const body = `Hi ${firstName(a.customer_name)}, ${shop}: hope your repair went well! Quick rating? ${link}`

    const res = await sendSMS(cfg, to, body)
    if (!res.ok) {
      failed += 1
      failures.push({ id: a.id, reason: res.error || 'sms failed' })
      continue
    }
    sent += 1
  }

  return json({
    ok: true,
    scanned: appts?.length ?? 0,
    eligible: work.length,
    sent,
    unconfigured,
    failed,
    failures,
  })
})
