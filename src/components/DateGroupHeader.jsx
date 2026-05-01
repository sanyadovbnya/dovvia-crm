// Section header used between day-bucketed rows on the Calls and Leads tabs.
// Renders the day label as a small uppercase tag with a visible rule
// running to the right edge of the row container. Accepts an optional
// `id` so the parent list can scroll the header into view from elsewhere
// in the page (e.g. the Today stat card).
export default function DateGroupHeader({ label, id }) {
  return (
    <div id={id} className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-2 bg-surface-muted/40 dark:bg-slate-800/30 scroll-mt-24">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-strong dark:text-slate-200 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-0.5 rounded-full bg-slate-300 dark:bg-slate-600" />
    </div>
  )
}
