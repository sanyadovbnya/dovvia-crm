// Cron-triggered endpoint: scans scheduled appointments, sends SMS reminders via
// Twilio 24h and 2h before each appointment, and marks them as sent so we never
// double-send.
//
// Multi-tenant: each appointment's owner (profiles row) supplies their own
// Twilio credentials via the Settings UI. Appointments owned by users without
// Twilio credentials are skipped silently (reported in the response).
//
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
// Cron:   see SETUP.md in this folder.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const TZ = 'America/Los_Angeles'
const WINDOW_HALF_MINUTES = 30
const H24 = 24 * 60
const H2  = 2 * 60

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

function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  return d.length >= 10 ? (d.length === 10 ? `+1${d}` : `+${d}`) : null
}

function apptUTC(date: string, timeStart: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = timeStart.split(':').map(Number)
  const naive = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(naive)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const ptAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  const offset = naive.getTime() - ptAsUtc
  return new Date(naive.getTime() + offset)
}

function humanTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function humanDay(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function firstName(raw?: string | null): string {
  if (!raw) return 'there'
  const w = raw.trim().split(/\s+/)[0]
  return w || 'there'
}

function messageFor(kind: '24h' | '2h', appt: any, shopName: string): string {
  const name = firstName(appt.customer_name)
  const service = appt.service_type || 'appointment'
  const shop = shopName || 'Your repair shop'
  if (kind === '24h') {
    return `Hey ${name}, ${shop}: reminder your ${service} is on ${humanDay(appt.date)} at ${humanTime(appt.time_start)}. Call us to cancel or reschedule.`
  }
  return `${name}, ${shop}: your technician will arrive in about 2 hours — ${humanTime(appt.time_start)} today for ${service}. See you soon!`
}

async function sendSMS(cfg: Profile, to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const { twilio_account_sid: sid, twilio_auth_token: token, twilio_from_number: from } = cfg
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
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: payload?.message || `Twilio ${res.status}` }
  return { ok: true, sid: payload?.sid }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const todayPT = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const maxDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id, user_id, customer_name, customer_phone, caller_phone, service_type, date, time_start, status, reminder_24h_sent_at, reminder_2h_sent_at')
    .eq('status', 'scheduled')
    .gte('date', todayPT)
    .lte('date', maxDate)

  if (error) {
    console.error('query failed:', error.message)
    return json({ ok: false, error: error.message }, 500)
  }

  // Filter to appointments needing a reminder right now.
  type Work = { appt: any; kind: '24h' | '2h' }
  const work: Work[] = []
  for (const a of appts ?? []) {
    const apptAt = apptUTC(a.date, a.time_start)
    const minutesUntil = (apptAt.getTime() - now.getTime()) / 60000
    const want24 = Math.abs(minutesUntil - H24) <= WINDOW_HALF_MINUTES && !a.reminder_24h_sent_at
    const want2  = Math.abs(minutesUntil - H2)  <= WINDOW_HALF_MINUTES && !a.reminder_2h_sent_at
    if (want24) work.push({ appt: a, kind: '24h' })
    else if (want2) work.push({ appt: a, kind: '2h' })
  }

  // Fetch Twilio config once per owning user.
  const userIds = [...new Set(work.map(w => w.appt.user_id))]
  const profilesById = new Map<string, Profile>()
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, shop_name, twilio_account_sid, twilio_auth_token, twilio_from_number')
      .in('id', userIds)
    for (const p of profs ?? []) profilesById.set(p.id, p as Profile)
  }

  let sent24 = 0, sent2 = 0, failed = 0, unconfigured = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (const { appt: a, kind } of work) {
    const cfg = profilesById.get(a.user_id)
    if (!cfg || !cfg.twilio_account_sid || !cfg.twilio_auth_token || !cfg.twilio_from_number) {
      unconfigured += 1
      continue
    }

    const to = phoneDigits(a.customer_phone) || phoneDigits(a.caller_phone)
    if (!to) { failed += 1; failures.push({ id: a.id, reason: 'no usable phone' }); continue }

    const res = await sendSMS(cfg, to, messageFor(kind, a, cfg.shop_name ?? ''))
    if (!res.ok) {
      failed += 1
      failures.push({ id: a.id, reason: res.error || 'send failed' })
      continue
    }

    const col = kind === '24h' ? 'reminder_24h_sent_at' : 'reminder_2h_sent_at'
    const { error: updErr } = await supabase
      .from('appointments')
      .update({ [col]: new Date().toISOString() })
      .eq('id', a.id)
    if (updErr) {
      failed += 1
      failures.push({ id: a.id, reason: `db update: ${updErr.message}` })
      continue
    }
    if (kind === '24h') sent24 += 1; else sent2 += 1
  }

  return json({
    ok: true,
    scanned: appts?.length ?? 0,
    eligible: work.length,
    sent_24h: sent24,
    sent_2h: sent2,
    unconfigured,
    failed,
    failures,
  })
})
