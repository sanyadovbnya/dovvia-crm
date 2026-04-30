import { normalizeStructuredOutputs } from './structuredOutputs'

export function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function fmtDuration(secs) {
  if (!secs && secs !== 0) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function callDuration(call) {
  if (!call.endedAt || !call.startedAt) return null
  return (new Date(call.endedAt) - new Date(call.startedAt)) / 1000
}

export function callOutputs(call) {
  if (call.__outputs) return call.__outputs
  const out = normalizeStructuredOutputs(call)
  Object.defineProperty(call, '__outputs', { value: out, enumerable: false })
  return out
}

export function isBooked(call) {
  const o = callOutputs(call)
  const v = o.appointmentBooked
  return v === true || v === 'true' || v === 'yes' || v === 'Yes'
}

export function isWaiting(call) {
  const o = callOutputs(call)
  const v = o.wantsCallback
  return !isBooked(call) && (v === true || v === 'true' || v === 'yes' || v === 'Yes')
}

export function getCallerName(call) {
  const o = callOutputs(call)
  return o.customerName || call.customer?.number || 'Unknown Caller'
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME_24H = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

function normalizeDate(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()
  if (ISO_DATE.test(s)) return s
  const parsed = new Date(s)
  if (isNaN(parsed)) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeTime(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()
  const m24 = s.match(TIME_24H)
  if (m24) {
    const h = Math.min(23, parseInt(m24[1], 10))
    const mm = m24[2]
    return `${String(h).padStart(2, '0')}:${mm}`
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (m12) {
    let h = parseInt(m12[1], 10) % 12
    if (m12[3].toLowerCase() === 'pm') h += 12
    const mm = m12[2] || '00'
    return `${String(h).padStart(2, '0')}:${mm}`
  }
  return null
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export function extractAppointment(call) {
  if (!isBooked(call)) return null
  const o = callOutputs(call)
  const date = normalizeDate(o.appointmentDate)
  const timeStart = normalizeTime(o.appointmentTime)
  if (!date || !timeStart) return null
  const customerName = (o.customerName || '').trim() || getCallerName(call)
  return {
    call_id: call.id,
    customer_name: customerName,
    customer_phone: o.customerPhone || call.customer?.number || null,
    caller_phone: call.customer?.number || null,
    customer_address: o.customerAddress || null,
    service_type: o.serviceType || 'General Home Services',
    problem: o.problem || null,
    date,
    time_start: `${timeStart}:00`,
    time_end: `${addMinutes(timeStart, 120)}:00`,
    status: o.appointmentCancelled === true ? 'cancelled' : 'scheduled',
    notes: o.callSummary || null,
    source: 'vapi',
  }
}

export function parseTranscript(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map(m => ({
      role: m.role || 'unknown',
      text: m.message || m.content || m.text || '',
    }))
  }
  return raw.split('\n').filter(Boolean).map(line => {
    const assistantMatch = line.match(/^(AI|Assistant|Dovvia|Max)\s*[:\-]\s*(.+)/i)
    const userMatch = line.match(/^(User|Customer|Caller|Human)\s*[:\-]\s*(.+)/i)
    if (assistantMatch) return { role: 'assistant', text: assistantMatch[2] }
    if (userMatch) return { role: 'user', text: userMatch[2] }
    return { role: 'user', text: line }
  })
}
