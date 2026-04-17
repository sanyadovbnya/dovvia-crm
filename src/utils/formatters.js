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

export function isBooked(call) {
  const sd = call.analysis?.structuredData || {}
  return sd.appointmentBooked === true
    || sd.appointmentBooked === 'true'
    || sd.appointmentBooked === 'yes'
    || sd.appointmentBooked === 'Yes'
}

export function getCallerName(call) {
  const sd = call.analysis?.structuredData || {}
  return sd.customerName || call.customer?.number || 'Unknown Caller'
}

export function parseTranscript(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map(m => ({
      role: m.role || 'unknown',
      text: m.message || m.content || m.text || '',
    }))
  }
  // Plain text — split by speaker labels
  return raw.split('\n').filter(Boolean).map(line => {
    const assistantMatch = line.match(/^(AI|Assistant|Max)\s*[:\-]\s*(.+)/i)
    const userMatch = line.match(/^(User|Customer|Caller|Human)\s*[:\-]\s*(.+)/i)
    if (assistantMatch) return { role: 'assistant', text: assistantMatch[2] }
    if (userMatch) return { role: 'user', text: userMatch[2] }
    return { role: 'user', text: line }
  })
}
