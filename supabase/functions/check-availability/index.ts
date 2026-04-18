// Vapi tool endpoint: given a date, returns which of the four 2-hour slots
// (10-12, 12-2, 2-4, 4-6) are open for the assistant's owning user.
//
// Deploy: supabase functions deploy check-availability --no-verify-jwt
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SLOTS = [
  { label: '10am-12pm', start: '10:00:00', end: '12:00:00' },
  { label: '12pm-2pm',  start: '12:00:00', end: '14:00:00' },
  { label: '2pm-4pm',   start: '14:00:00', end: '16:00:00' },
  { label: '4pm-6pm',   start: '16:00:00', end: '18:00:00' },
]

const SATURDAY_SLOTS = SLOTS.slice(0, 2)

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

function result(toolCallId: string, text: string) {
  return json({ results: [{ toolCallId, result: text }] })
}

const TZ = 'America/Los_Angeles'

function todayInTZ(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

function resolveDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (s === 'today') return todayInTZ()
  if (s === 'tomorrow') return addDays(todayInTZ(), 1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function humanDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function dowFromISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  // Vapi sends either { message: { toolCalls: [...], call: { assistantId } } }
  // or similar. Pull the pieces defensively.
  const msg = payload?.message ?? payload
  const toolCall = msg?.toolCalls?.[0] ?? msg?.toolCallList?.[0]
  const toolCallId = toolCall?.id ?? 'unknown'
  const assistantId =
    msg?.call?.assistantId ??
    msg?.assistant?.id ??
    payload?.call?.assistantId

  let args = toolCall?.function?.arguments ?? toolCall?.arguments ?? {}
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { args = {} }
  }

  const date = resolveDate(args?.date)
  if (!date) {
    return result(toolCallId, 'Please provide the date as "today", "tomorrow", or YYYY-MM-DD format.')
  }

  const today = todayInTZ()
  if (date < today) {
    return result(toolCallId, `${humanDate(date)} is in the past. Today is ${humanDate(today)}. Please pick today or a future date.`)
  }

  const dow = dowFromISO(date)
  if (dow === 0) {
    return result(toolCallId, `${humanDate(date)} is a Sunday — we are closed.`)
  }

  if (!assistantId) {
    return result(toolCallId, 'I could not identify the assistant. Please try again.')
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('vapi_assistant_id', assistantId)
    .single()

  if (!profile) {
    return result(toolCallId, 'No account is linked to this assistant yet.')
  }

  const { data: appts, error } = await supabase
    .from('appointments')
    .select('time_start, time_end, status')
    .eq('user_id', profile.id)
    .eq('date', date)
    .neq('status', 'cancelled')

  if (error) {
    console.error('query failed:', error.message)
    return result(toolCallId, 'I had trouble checking availability — please try again in a moment.')
  }

  let candidateSlots = dow === 6 ? SATURDAY_SLOTS : SLOTS

  if (date === today) {
    const nowPT = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
    const nowSec = nowPT + ':00'
    candidateSlots = candidateSlots.filter(s => s.start > nowSec)
  }

  if (candidateSlots.length === 0) {
    return result(toolCallId, `No remaining slots on ${humanDate(date)}. Suggest the next business day.`)
  }

  const taken = (appts ?? []).map(a => ({ start: a.time_start, end: a.time_end }))

  const lines = candidateSlots.map(s => {
    const conflict = taken.some(t => t.start < s.end && t.end > s.start)
    return `${s.label}: ${conflict ? 'booked' : 'open'}`
  })

  const openCount = lines.filter(l => l.endsWith('open')).length
  const summary = openCount === 0
    ? `${humanDate(date)} is fully booked — suggest another day.`
    : `${humanDate(date)} availability — ${lines.join(', ')}.`

  return result(toolCallId, summary)
})
