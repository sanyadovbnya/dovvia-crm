// Vapi tool endpoint: given a caller's phone, return a short summary of their
// past appointments so Max can greet them personally.
//
// Deploy: supabase functions deploy get-customer-history --no-verify-jwt

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

function phoneDigits(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const d = raw.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
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

function humanDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function humanTime(hhmmss: string) {
  const [h, m] = hhmmss.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
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

  // Fallback to caller's number from Vapi if tool arg is missing
  const callerNumber =
    msg?.call?.customer?.number ??
    payload?.call?.customer?.number
  const phone = phoneDigits(args?.phone) || phoneDigits(callerNumber)

  if (!phone) return result(toolCallId, 'I need the customer phone number to look up history.')
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
    .select('customer_name, customer_phone, caller_phone, service_type, problem, date, time_start, status')
    .eq('user_id', profile.id)
    .order('date', { ascending: false })
    .limit(50)

  if (error) {
    console.error('query failed:', error.message)
    return result(toolCallId, 'I had trouble looking up history. Please continue normally.')
  }

  const matches = (appts ?? []).filter(a => {
    const phones = [phoneDigits(a.customer_phone), phoneDigits(a.caller_phone)]
    return phones.includes(phone)
  })

  if (matches.length === 0) {
    return result(toolCallId, 'No previous appointments found for that number. Treat as a new customer.')
  }

  const today = todayInTZ()
  const upcoming = matches.filter(a => a.date >= today && a.status !== 'cancelled')
  const past     = matches.filter(a => a.date <  today && a.status !== 'cancelled')
  const cancelled = matches.filter(a => a.status === 'cancelled')

  const name = matches[0].customer_name || 'this customer'
  const serviceCounts = new Map<string, number>()
  for (const a of matches) {
    if (!a.service_type) continue
    serviceCounts.set(a.service_type, (serviceCounts.get(a.service_type) || 0) + 1)
  }
  const topServices = [...serviceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([s]) => s)

  const parts: string[] = []
  parts.push(`${name} is a returning customer with ${matches.length} appointment${matches.length === 1 ? '' : 's'} on file.`)

  if (upcoming.length > 0) {
    const next = upcoming[upcoming.length - 1] // oldest upcoming = soonest
    parts.push(`They have an upcoming appointment on ${humanDate(next.date)} at ${humanTime(next.time_start)} for ${next.service_type || 'service'}.`)
  }

  if (past.length > 0) {
    const last = past[0]
    parts.push(`Last service: ${humanDate(last.date)} for ${last.service_type || 'service'}${last.problem ? ` (${last.problem})` : ''}.`)
  }

  if (topServices.length > 0 && past.length > 1) {
    parts.push(`They most often book ${topServices.join(' and ')}.`)
  }

  if (cancelled.length > 0 && cancelled.length >= matches.length / 2) {
    parts.push(`Note: ${cancelled.length} of their appointments were cancelled.`)
  }

  return result(toolCallId, parts.join(' '))
})
