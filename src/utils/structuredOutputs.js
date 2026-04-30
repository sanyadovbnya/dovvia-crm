const NAME_MAP = {
  'Call Summary': 'callSummary',
  'Success Evaluation - Pass/Fail': 'successPassFail',
  'Success Evaluation - Numeric Scale': 'successScore',
  'Appointment Booked': 'appointmentBooked',
  'Appointment Cancelled': 'appointmentCancelled',
  'Appointment Rescheduled': 'appointmentRescheduled',
  'Appointment Date': 'appointmentDate',
  'Appointment Time': 'appointmentTime',
  'Customer Name': 'customerName',
  'Customer Phone': 'customerPhone',
  'Customer Address': 'customerAddress',
  'Service Type': 'serviceType',
  'Problem Description': 'problem',
  'Customer Sentiment': 'customerSentiment',
  'Wants Callback': 'wantsCallback',
}

export function normalizeStructuredOutputs(call) {
  const raw = call?.analysis?.structuredOutputs
    ?? call?.artifact?.structuredOutputs
    ?? call?.structuredOutputs
  if (!raw) return call?.analysis?.structuredData || {}

  const out = {}
  const entries = Array.isArray(raw) ? raw : Object.values(raw)
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const key = NAME_MAP[entry.name]
    if (key && entry.result !== undefined && entry.result !== null && entry.result !== '') {
      out[key] = entry.result
    }
  }
  return out
}
