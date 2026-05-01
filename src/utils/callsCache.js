// Per-user localStorage cache for the calls list. Lets the dashboard render
// the last-known calls instantly on cold start (so a flaky network doesn't
// leave Mike staring at a spinner) and lets loadCalls fetch only the recent
// window via createdAtGt instead of redownloading the whole backlog.

const KEY_PREFIX = 'dovvia:calls:'
const MAX_CACHED = 500
// Drop caches older than this on read so we don't show stale state to a
// user who comes back after a long break.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
// Window of overlap on incremental fetch — covers calls that were still
// in-flight last sync and may have updated metadata (transcript, recording
// URL, analysis) since.
export const INCREMENTAL_OVERLAP_MS = 6 * 60 * 60 * 1000 // 6 hours

const key = userId => `${KEY_PREFIX}${userId}`

export function readCallsCache(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data?.calls)) return null
    if (Date.now() - (data.updatedAt || 0) > MAX_AGE_MS) return null
    return data
  } catch {
    return null
  }
}

export function writeCallsCache(userId, calls) {
  if (!userId || !Array.isArray(calls)) return
  try {
    localStorage.setItem(key(userId), JSON.stringify({
      calls: calls.slice(0, MAX_CACHED),
      updatedAt: Date.now(),
    }))
  } catch {
    // Quota exceeded or storage disabled — silently ignore; we'll just
    // refetch next time.
  }
}

export function clearCallsCache(userId) {
  if (!userId) return
  try { localStorage.removeItem(key(userId)) } catch { /* noop */ }
}

// Merges fresh API rows into a cached array, with fresh winning on
// duplicate ids (so updated transcripts/analysis overwrite stale entries),
// then sorts desc by createdAt.
export function mergeCalls(fresh = [], cached = []) {
  const map = new Map()
  for (const c of cached) if (c?.id) map.set(c.id, c)
  for (const c of fresh)  if (c?.id) map.set(c.id, c)
  return [...map.values()].sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  )
}
