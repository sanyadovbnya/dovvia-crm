import { Icons } from './Icons'

// Small × button rendered at the top-right of an expanded panel.
// Used by the Resolution panels so operators can dismiss them without
// scrolling back up to the toggle button. Lays out as a slim flex row so
// it doesn't overlap the panel's first content row.
export default function PanelCloseButton({ onClick, label = 'Close' }) {
  return (
    <div className="flex justify-end -mr-1.5 -mt-1.5">
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:text-ink-strong hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/70 transition"
      >
        <Icons.X />
      </button>
    </div>
  )
}
