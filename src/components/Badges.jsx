export function EndReasonBadge({ reason }) {
  if (!reason) return <span className="badge badge-gray">unknown</span>
  const r = reason.toLowerCase()
  if (r.includes('customer-ended') || r === 'hangup')
    return <span className="badge badge-blue">Ended by caller</span>
  if (r.includes('voicemail'))
    return <span className="badge badge-yellow">Voicemail</span>
  if (r.includes('assistant-ended') || r === 'end-call-function-called')
    return <span className="badge badge-green">Completed</span>
  if (r.includes('error') || r.includes('timeout') || r.includes('failed'))
    return <span className="badge badge-red">{reason}</span>
  return <span className="badge badge-gray">{reason}</span>
}

export function AppointmentBadge({ value }) {
  const booked = value === true || value === 'true' || value === 'yes' || value === 'Yes'
  return booked
    ? <span className="badge badge-green">Booked ✓</span>
    : <span className="badge badge-gray">Not booked</span>
}
