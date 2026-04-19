const VAPI_BASE = 'https://api.vapi.ai'

export async function apiGet(key, path, params = {}) {
  const url = new URL(VAPI_BASE + path)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vapi API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function fetchCalls(key, { limit = 50, createdAtGt, createdAtLt } = {}) {
  const data = await apiGet(key, '/call', { limit, createdAtGt, createdAtLt })
  // Vapi can return array directly or { results: [] }
  const calls = Array.isArray(data) ? data : (data.results || data.calls || [])
  // Vapi soft-deletes: tombstone rows show up with endedReason='call-deleted'
  // (or a deletedAt timestamp). Hide them from the dashboard.
  return calls.filter(c => c.endedReason !== 'call-deleted' && !c.deletedAt)
}

export async function fetchCall(key, callId) {
  return apiGet(key, `/call/${callId}`)
}

export async function testConnection(key) {
  await apiGet(key, '/call', { limit: 1 })
}
