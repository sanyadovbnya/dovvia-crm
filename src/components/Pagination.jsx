import { Icons } from './Icons'

export const PAGE_SIZE = 25

/**
 * Slices `items` to a single page-of-PAGE_SIZE window. Pure helper so the
 * caller can pass it through into existing list-rendering code.
 */
export function paginate(items, page, pageSize = PAGE_SIZE) {
  const total = items?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const end = start + pageSize
  return {
    page: safePage,
    totalPages,
    total,
    start,
    end: Math.min(end, total),
    items: (items || []).slice(start, end),
  }
}

/**
 * Renders a Previous / page indicator / Next bar at the bottom of a list.
 * Hides itself when there's only a single page worth of content.
 */
export default function Pagination({ page, totalPages, total, start, end, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-surface-muted/40 dark:bg-slate-800/30">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="btn-ghost text-xs disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="rotate-180 inline-flex"><Icons.ChevronRight /></span>
        <span className="hidden sm:inline">Previous</span>
      </button>
      <p className="text-xs text-ink-muted dark:text-slate-400 tabular-nums">
        {start + 1}–{end} of {total}
      </p>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="btn-ghost text-xs disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="hidden sm:inline">Next</span>
        <Icons.ChevronRight />
      </button>
    </div>
  )
}
