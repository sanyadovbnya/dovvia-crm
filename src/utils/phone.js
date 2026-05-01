// Returns the last 10 digits of a phone number, or null if there are fewer than 10.
// Useful as a comparison key (spoken vs caller ID) where formatting differs.
export function phoneDigits(raw) {
  if (typeof raw !== 'string') return null
  const d = raw.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}

export function fmtPhone(raw) {
  const d = phoneDigits(raw)
  if (!d) return raw || '—'
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Returns a tel: href that's safe for click-to-call, or null when the
// input doesn't have enough digits to dial. Bare 10-digit numbers are
// assumed to be US/CA and prefixed with +1.
export function telHref(raw) {
  const d = phoneDigits(raw)
  if (!d) return null
  const num = d.length === 10 ? `+1${d}` : `+${d}`
  return `tel:${num}`
}
