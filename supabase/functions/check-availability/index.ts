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

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
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

  const date = args?.date
  if (!isValidDate(date)) {
    return result(toolCallId, 'Please provide the date in YYYY-MM-DD format.')
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

  const candidateSlots = dow === 6 ? SATURDAY_SLOTS : SLOTS
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
