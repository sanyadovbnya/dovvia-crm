import { OUTCOMES } from '../utils/resolutions'
import { Icons } from './Icons'

// Green primary-style button used as the header for both call and lead
// resolution sections. Visually pairs with Generate Invoice (same shape,
// different tone) so the two daily actions look like one toolbar.
//
// Pass `outcome` directly (lead.status, resolution.outcome) — the button
// auto-flips to "Resolution · Done" once the call/lead is resolved.
export default function ResolutionToggleButton({ outcome, expanded, onToggle, className = '' }) {
  const meta = outcome && outcome !== 'waiting' ? OUTCOMES[outcome] : null
  const label = meta ? 'Resolution' : 'Mark as Resolved'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2.5 text-sm transition shadow-card ${className}`}
    >
      <Icons.Check />
      {label}
      {meta && <span className="text-xs font-medium opacity-90">· {meta.short}</span>}
    </button>
  )
}
