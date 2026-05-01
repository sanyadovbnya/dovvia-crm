import { useState } from 'react'
import {
  OUTCOMES, OUTCOME_ACTIVE_BTN_CLASS,
  upsertResolution, deleteResolution,
  parseAmountToCents, fmtCents, dollarsFromCents,
} from '../utils/resolutions'
import { Icons } from './Icons'

export default function ResolutionForm({ callId, resolution, onSaved, expanded: expandedProp, onToggle }) {
  // Allow the parent to control expansion (so the toggle button can sit on
  // the same toolbar row as Generate Invoice). Falls back to internal state.
  const [expandedSelf, setExpandedSelf] = useState(false)
  const isControlled = expandedProp !== undefined
  const expanded = isControlled ? expandedProp : expandedSelf
  const setExpanded = isControlled ? (v => onToggle?.(typeof v === 'function' ? v(expanded) : v)) : setExpandedSelf
  const [editing, setEditing] = useState(!resolution)
  const [outcome, setOutcome] = useState(resolution?.outcome || 'done')
  const [bookedFor, setBookedFor] = useState(resolution?.booked_for || '')
  const [amount, setAmount] = useState(dollarsFromCents(resolution?.amount_cents))
  const [work, setWork] = useState(resolution?.work_description || '')
  const [notes, setNotes] = useState(resolution?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await upsertResolution({
        call_id: callId,
        outcome,
        booked_for: bookedFor.trim(),
        amount_cents: parseAmountToCents(amount),
        work_description: work.trim(),
        notes: notes.trim(),
      })
      setEditing(false)
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!confirm('Clear this resolution?')) return
    setSaving(true); setError('')
    try {
      await deleteResolution(callId)
      setOutcome('done'); setBookedFor(''); setAmount(''); setWork(''); setNotes('')
      setEditing(true)
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Failed to clear')
    } finally {
      setSaving(false)
    }
  }

  const showSummary = !editing && resolution
  const headerLabel = showSummary
    ? 'Resolution'
    : (resolution ? 'Edit Resolution' : 'Mark as Resolved')
  const headerMeta = showSummary ? OUTCOMES[resolution.outcome] : null

  function renderSummary() {
    const meta = OUTCOMES[resolution.outcome]
    return (
      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge badge-${meta?.tone || 'gray'}`}>✓ {meta?.label || resolution.outcome}</span>
          {resolution.outcome === 'done' && resolution.amount_cents != null && (
            <span className="text-sm font-semibold text-ink-strong dark:text-slate-100">{fmtCents(resolution.amount_cents)}</span>
          )}
        </div>
        {resolution.outcome === 'booked' && resolution.booked_for && (
          <p className="text-sm text-ink-strong dark:text-slate-200"><span className="text-ink-muted dark:text-slate-400">When: </span>{resolution.booked_for}</p>
        )}
        {resolution.outcome === 'done' && resolution.work_description && (
          <p className="text-sm text-ink-strong dark:text-slate-200"><span className="text-ink-muted dark:text-slate-400">Work: </span>{resolution.work_description}</p>
        )}
        {resolution.notes && (
          <p className="text-sm text-ink-strong dark:text-slate-200"><span className="text-ink-muted dark:text-slate-400">Notes: </span>{resolution.notes}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs !py-1.5">Edit</button>
          <button onClick={handleClear} disabled={saving} className="btn-ghost text-xs !py-1.5 text-red-600 dark:text-red-400">Clear</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2.5 text-sm transition shadow-card mb-2"
          aria-expanded={expanded}
        >
          <Icons.Check />
          {headerLabel}
          {headerMeta && (
            <span className="text-xs font-medium opacity-90">· {headerMeta.short}</span>
          )}
        </button>
      )}

      {expanded && showSummary && renderSummary()}

      {expanded && !showSummary && (
      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(OUTCOMES).map(([key, meta]) => {
            const active = outcome === key
            return (
              <button
                key={key}
                onClick={() => setOutcome(key)}
                className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition border ${active
                  ? OUTCOME_ACTIVE_BTN_CLASS[key]
                  : 'bg-white dark:bg-slate-900 text-ink-strong dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                {meta.label}
              </button>
            )
          })}
        </div>

        {outcome === 'booked' && (
          <div>
            <label className="text-xs text-ink-muted dark:text-slate-400">When</label>
            <input
              value={bookedFor}
              onChange={e => setBookedFor(e.target.value)}
              placeholder="e.g. Fri 4/25 at 2pm"
              className="mt-1"
            />
          </div>
        )}

        {outcome === 'done' && (
          <>
            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">Amount (optional)</label>
              <div className="relative mt-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500 text-sm">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">What was done (optional)</label>
              <textarea
                rows={2}
                value={work}
                onChange={e => setWork(e.target.value)}
                placeholder="e.g. Replaced water heater element"
                className="mt-1"
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-ink-muted dark:text-slate-400">Notes (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything else worth remembering"
            className="mt-1"
          />
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs !py-2">
            {saving ? <Icons.Spinner /> : <Icons.Check />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          {resolution && (
            <button onClick={() => setEditing(false)} disabled={saving} className="btn-ghost text-xs !py-2">Cancel</button>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
