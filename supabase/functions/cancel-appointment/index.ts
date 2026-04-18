// Vapi tool endpoint: cancel an upcoming appointment matching phone + first name + date.
//
// Deploy: supabase functions deploy cancel-appointment --no-verify-jwt
//
// Max is expected to verbally confirm the appointment's date with the caller
// BEFORE calling this tool. The tool intentionally requires date as an input
// so it cannot cancel the wrong appointment if the caller gives a stale phone.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const TZ = 'America/Los_Angeles'

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
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function humanTime(hhmmss: string) {
  const [h, m] = hhmmss.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function phoneDigits(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const d = raw.replace(/\D/g, '')
  if (d.length < 10) return null
  return d.slice(-10)
}

function firstName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const w = raw.trim().split(/\s+/)[0]
  return w ? w.toLowerCase() : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let payload: any
  try { payload = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

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

  const phone = phoneDigits(args?.phone)
  const name = firstName(args?.first_name ?? args?.firstName ?? args?.name)
  const date = resolveDate(args?.date)

  if (!phone) return result(toolCallId, 'I need the phone number the appointment was booked under.')
  if (!name) return result(toolCallId, 'I need the first name on the appointment.')
  if (!date) return result(toolCallId, 'I need the appointment date — today, tomorrow, or YYYY-MM-DD.')
  if (!assistantId) return result(toolCallId, 'I could not identify the assistant.')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('vapi_assistant_id', assistantId)
    .single()

  if (!profile) return result(toolCallId, 'No account is linked to this assistant.')

  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id, customer_name, customer_phone, date, time_start, status')
    .eq('user_id', profile.id)
    .eq('date', date)
    .neq('status', 'cancelled')

  if (error) {
    console.error('query failed:', error.message)
    return result(toolCallId, 'I had trouble looking up the appointment — please try again.')
  }

  const matches = (appts ?? []).filter(a => {
    const aPhone = phoneDigits(a.customer_phone)
    const aFirst = firstName(a.customer_name)
    return aPhone === phone && aFirst === name
  })

  if (matches.length === 0) {
    return result(
      toolCallId,
      `I couldn't find an appointment on ${humanDate(date)} under that phone and first name. Double-check the phone number or the date.`,
    )
  }

  if (matches.length > 1) {
    const times = matches.map(m => humanTime(m.time_start)).join(', ')
    return result(
      toolCallId,
      `I found more than one appointment on ${humanDate(date)} (${times}). Which time should be cancelled?`,
    )
  }

  const appt = matches[0]
  const { error: updateErr } = await supabase
    .from('appointments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', appt.id)
    .eq('user_id', profile.id)

  if (updateErr) {
    console.error('cancel failed:', updateErr.message)
    return result(toolCallId, 'I had trouble cancelling the appointment — please try again in a moment.')
  }

  return result(
    toolCallId,
    `Cancelled ${appt.customer_name}'s appointment on ${humanDate(date)} at ${humanTime(appt.time_start)}.`,
  )
})
