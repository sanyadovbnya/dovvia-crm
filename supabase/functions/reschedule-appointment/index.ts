// Vapi tool endpoint: reschedule an upcoming appointment to a new day + slot.
// Matches on phone + first name + old_date, then moves to new_date + new_time.
// Refuses to move onto an already-booked slot.
//
// Deploy: supabase functions deploy reschedule-appointment --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const TZ = 'America/Los_Angeles'

const SLOT_DURATION_MIN = 120

const VALID_START_TIMES = ['10:00', '12:00', '14:00', '16:00']
const SATURDAY_START_TIMES = ['10:00', '12:00']

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

function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (m24) {
    const h = Math.min(23, parseInt(m24[1], 10))
    return `${String(h).padStart(2, '0')}:${m24[2]}`
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (m12) {
    let h = parseInt(m12[1], 10) % 12
    if (m12[3].toLowerCase() === 'pm') h += 12
    return `${String(h).padStart(2, '0')}:${m12[2] || '00'}`
  }
  return null
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
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

function dowFromISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function phoneDigits(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const d = raw.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
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
  const oldDate = resolveDate(args?.old_date ?? args?.oldDate ?? args?.from_date)
  const newDate = resolveDate(args?.new_date ?? args?.newDate ?? args?.to_date)
  const newTime = normalizeTime(args?.new_time ?? args?.newTime ?? args?.to_time)

  if (!phone) return result(toolCallId, 'I need the phone number the appointment was booked under.')
  if (!name) return result(toolCallId, 'I need the first name on the appointment.')
  if (!oldDate) return result(toolCallId, 'I need the current appointment date.')
  if (!newDate) return result(toolCallId, 'I need the new date you want to move the appointment to.')
  if (!newTime) return result(toolCallId, 'I need the new start time — offer the caller a specific open slot first.')
  if (!assistantId) return result(toolCallId, 'I could not identify the assistant.')

  const today = todayInTZ()
  if (newDate < today) {
    return result(toolCallId, `${humanDate(newDate)} is in the past. Pick today or a future date.`)
  }

  const newDow = dowFromISO(newDate)
  if (newDow === 0) {
    return result(toolCallId, `${humanDate(newDate)} is a Sunday — we are closed. Pick another day.`)
  }

  const allowedStarts = newDow === 6 ? SATURDAY_START_TIMES : VALID_START_TIMES
  if (!allowedStarts.includes(newTime)) {
    return result(
      toolCallId,
      `${humanTime(newTime + ':00')} is not one of our slot start times on ${humanDate(newDate)}. Available slots start at ${allowedStarts.map(t => humanTime(t + ':00')).join(', ')}.`,
    )
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

  if (!profile) return result(toolCallId, 'No account is linked to this assistant.')

  // Find the original appointment
  const { data: oldAppts, error: findErr } = await supabase
    .from('appointments')
    .select('id, customer_name, customer_phone, date, time_start')
    .eq('user_id', profile.id)
    .eq('date', oldDate)
    .neq('status', 'cancelled')

  if (findErr) {
    console.error('find failed:', findErr.message)
    return result(toolCallId, 'I had trouble looking up the appointment. Please try again.')
  }

  const matches = (oldAppts ?? []).filter(a => {
    return phoneDigits(a.customer_phone) === phone && firstName(a.customer_name) === name
  })

  if (matches.length === 0) {
    return result(
      toolCallId,
      `I couldn't find an appointment on ${humanDate(oldDate)} under that phone and first name. Double-check the date or phone number.`,
    )
  }
  if (matches.length > 1) {
    const times = matches.map(m => humanTime(m.time_start)).join(', ')
    return result(
      toolCallId,
      `I found more than one appointment on ${humanDate(oldDate)} (${times}). Which time should be moved?`,
    )
  }

  const appt = matches[0]
  const newTimeStart = `${newTime}:00`
  const newTimeEnd = `${addMinutes(newTime, SLOT_DURATION_MIN)}:00`

  // Conflict check: any other non-cancelled appointment overlapping this slot?
  const { data: conflicts, error: conflictErr } = await supabase
    .from('appointments')
    .select('id, time_start, time_end')
    .eq('user_id', profile.id)
    .eq('date', newDate)
    .neq('status', 'cancelled')
    .neq('id', appt.id)

  if (conflictErr) {
    console.error('conflict check failed:', conflictErr.message)
    return result(toolCallId, 'I had trouble confirming the new slot is open. Please try again.')
  }

  const overlap = (conflicts ?? []).some(c =>
    c.time_start < newTimeEnd && c.time_end > newTimeStart,
  )
  if (overlap) {
    return result(
      toolCallId,
      `The ${humanTime(newTimeStart)} slot on ${humanDate(newDate)} is already booked. Offer the caller a different open slot.`,
    )
  }

  const { error: updateErr } = await supabase
    .from('appointments')
    .update({
      date: newDate,
      time_start: newTimeStart,
      time_end: newTimeEnd,
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', appt.id)
    .eq('user_id', profile.id)

  if (updateErr) {
    console.error('reschedule failed:', updateErr.message)
    return result(toolCallId, 'I had trouble saving the reschedule. Please try again.')
  }

  return result(
    toolCallId,
    `Moved ${appt.customer_name}'s appointment from ${humanDate(oldDate)} ${humanTime(appt.time_start)} to ${humanDate(newDate)} at ${humanTime(newTimeStart)}.`,
  )
})
