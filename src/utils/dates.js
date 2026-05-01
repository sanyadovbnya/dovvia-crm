// Day-bucketing helpers shared by the Calls and Leads list views so each
// section gets a "Today" / "Yesterday" / "Apr 28" header before its rows.

const DAY_MS = 86400_000

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Returns a friendly label for the given date relative to today.
 *  - same day  → "Today"
 *  - 1 day ago → "Yesterday"
 *  - this year → "Mon, Apr 28"
 *  - older     → "Mon, Apr 28, 2025"
 */
export function fmtDayLabel(d) {
  const day = startOfDay(d)
  const today = startOfDay(new Date())
  const diff = Math.round((today - day) / DAY_MS)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const sameYear = day.getFullYear() === today.getFullYear()
  return day.toLocaleDateString('en-US', sameYear
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Buckets a list into [{ label, items }] segments by the calendar day of
 * each item's date. Preserves input order — pass an already-sorted list.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string|Date|null|undefined} getDate
 * @returns {{label: string, items: T[]}[]}
 */
export function groupByDay(items, getDate) {
  const groups = []
  let current = null
  for (const item of items || []) {
    const raw = getDate(item)
    if (!raw) continue
    const label = fmtDayLabel(new Date(raw))
    if (!current || current.label !== label) {
      current = { label, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}
