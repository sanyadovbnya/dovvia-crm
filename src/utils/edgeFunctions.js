// Single helper for invoking Supabase edge functions from the browser.
// All our AI-assist endpoints (parse-invoice, parse-lead-booking, …) share
// the same fetch shape, response envelope, and error handling — this keeps
// that surface in one place so adding another function is a one-liner.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * POST `body` to the named edge function. Returns the parsed JSON payload
 * on success; throws Error with the function's `error` field (or HTTP code)
 * on failure.
 *
 * Convention: edge functions return `{ ok: boolean, error?: string, ...data }`.
 *
 * @param {string} name  Edge function slug, e.g. 'parse-invoice'.
 * @param {object} body  JSON-serializable request body.
 * @returns {Promise<object>} Resolved JSON response.
 */
export async function callEdgeFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw new Error(data?.error || `Edge function ${name} failed (${res.status})`)
  }
  return data
}

export function edgeFunctionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`
}
