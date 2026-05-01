import { phoneDigits } from './phone'
import { callOutputs } from './formatters'

// We don't have a dedicated owner-name field on profiles yet, so try a few
// likely sources before falling back to splitting the shop name (e.g.
// "Mike's Repair Shop" → "Mike"). Returns '' when nothing usable is found.
export function ownerFirstName({ shopName, user } = {}) {
  const meta = user?.user_metadata || {}
  const direct = meta.first_name || meta.firstName || meta.given_name
  if (direct) return String(direct).trim().split(/\s+/)[0]
  const full = meta.full_name || meta.name
  if (full) return String(full).trim().split(/\s+/)[0]
  if (shopName) {
    const head = String(shopName).trim().split(/[\s,—-]+/)[0]
    return head.replace(/['’]s$/i, '') // strip possessive
  }
  return ''
}

// Builds the "follow up with a missed/waiting caller" SMS body. We surface
// what they asked Max about so the message lands as a real continuation of
// the call, not a generic blast. Falls back gracefully when fields are blank.
export function buildCallbackSms({ call, shopName, ownerName }) {
  const o = call ? callOutputs(call) : {}
  const lookingForRaw = (o.serviceType || '').trim()
  const lookingFor = lookingForRaw ? lookingForRaw.toLowerCase() : ''
  const opener = ownerName ? `Hi! This is ${ownerName}` : 'Hi!'
  const shop = shopName ? ` from ${shopName}` : ''
  const reason = lookingFor
    ? ` You called us looking for ${lookingFor}.`
    : ' You called us recently.'
  return `${opener}${shop}.${reason} Are you still looking for help?`
}

// sms: URLs accept ?body= on iOS 8+ and current Androids; older specs use
// `&body=` on iOS but `?body=` is the cross-platform sweet spot today.
// Returns null when there isn't a dialable number to text.
export function smsHref(phone, body) {
  const digits = phoneDigits(phone)
  if (!digits) return null
  const num = digits.length === 10 ? `+1${digits}` : `+${digits}`
  const q = body ? `?body=${encodeURIComponent(body)}` : ''
  return `sms:${num}${q}`
}
