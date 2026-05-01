import { useState } from 'react'
import { LEAD_STATUSES, resolveLead, updateLead, aiParseLeadBooking } from '../utils/leads'
import { supabase } from '../lib/supabase'
import { getSession } from '../utils/auth'
import {
  OUTCOMES, OUTCOME_ACTIVE_BTN_CLASS,
  parseAmountToCents, fmtCents, dollarsFromCents,
} from '../utils/resolutions'
import { Icons } from './Icons'

// Pulls the time portion out of "HH:MM:SS" appointment value back to the
// HH:MM string the <input type="time"> control wants.
function timeOnly(t) {
  if (!t) return ''
  return t.split(':').slice(0, 2).join(':')
}

export default function LeadResolutionForm({ lead, appointment, onSaved, onSpam, expanded: expandedProp, onToggle }) {
  const isResolved = lead.status && lead.status !== 'waiting'
  // Allow parent control so the toggle button can sit alongside other actions.
  const [expandedSelf, setExpandedSelf] = useState(false)
  const isControlled = expandedProp !== undefined
  const expanded = isControlled ? expandedProp : expandedSelf
  const setExpanded = isControlled ? (v => onToggle?.(typeof v === 'function' ? v(expanded) : v)) : setExpandedSelf
  const [editing, setEditing] = useState(!isResolved)
  const [outcome, setOutcome] = useState(isResolved ? lead.status : 'booked')
  const [date, setDate] = useState(appointment?.date || '')
  const [timeStart, setTimeStart] = useState(timeOnly(appointment?.time_start) || '')
  const [bookedFor, setBookedFor] = useState(lead.booked_for || '')
  const [serviceType, setServiceType] = useState(appointment?.service_type || '')
  const [address, setAddress] = useState(appointment?.customer_address || '')
  const [problem, setProblem] = useState(appointment?.problem || '')
  const [amount, setAmount] = useState(dollarsFromCents(lead.amount_cents))
  const [work, setWork] = useState(lead.work_description || '')
  const [notes, setNotes] = useState(lead.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // AI Assist (only for the Booked outcome)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')

  async function handleAiFill() {
    if (!aiText.trim()) { setAiErr('Type or paste some notes first.'); return }
    setAiBusy(true); setAiErr('')
    try {
      const b = await aiParseLeadBooking(aiText)
      if (b.date) setDate(b.date)
      if (b.time_start) setTimeStart(b.time_start)
      if (b.booked_for_text && !b.date) setBookedFor(b.booked_for_text)
      if (b.service_type) setServiceType(b.service_type)
      if (b.customer_address) setAddress(b.customer_address)
      if (b.problem) setProblem(b.problem)
      if (b.notes) setNotes(b.notes)
      setAiOpen(false)
      setAiText('')
    } catch (e) {
      setAiErr(e.message)
    } finally {
      setAiBusy(false)
    }
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await resolveLead(lead, outcome, {
        booked_for: bookedFor.trim() || (date && timeStart ? '' : 'TBD'),
        date: date || null,
        time_start: timeStart || null,
        service_type: serviceType.trim() || null,
        customer_address: address.trim() || null,
        problem: problem.trim() || null,
        amount_cents: parseAmountToCents(amount),
        work_description: work.trim() || null,
        notes: notes.trim() || null,
      })
      setEditing(false)
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleReopen() {
    if (!confirm('Move this lead back to Waiting?')) return
    setSaving(true); setError('')
    try {
      // If a real appointment was scheduled, cancel it so Max frees the slot.
      if (lead.appointment_id) {
        const s = await getSession()
        await supabase
          .from('appointments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', lead.appointment_id)
          .eq('user_id', s.user.id)
      }
      await updateLead(lead.id, {
        status: 'waiting',
        appointment_id: null,
        booked_for: null,
        amount_cents: null,
        work_description: null,
      })
      onSaved?.()
      setEditing(true)
    } catch (e) {
      setError(e.message || 'Failed to reopen')
    } finally {
      setSaving(false)
    }
  }

  // Header label tracks the current state.
  const showSummary = !editing && isResolved
  const headerLabel = showSummary
    ? 'Resolution'
    : (isResolved ? 'Edit Resolution' : 'Mark as Resolved')
  const headerMeta = showSummary ? LEAD_STATUSES[lead.status] : null

  // The summary block — extracted so the same collapsible wrapper can render
  // either it or the editor below.
  function renderSummary() {
    const meta = LEAD_STATUSES[lead.status]
    return (
      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge badge-${meta?.tone || 'gray'}`}>✓ {meta?.label || lead.status}</span>
          {lead.status === 'done' && lead.amount_cents != null && (
            <span className="text-sm font-semibold text-ink-strong dark:text-slate-100">{fmtCents(lead.amount_cents)}</span>
          )}
        </div>

        {lead.status === 'booked' && appointment && (
          <p className="text-sm text-ink-strong dark:text-slate-200">
            <span className="text-ink-muted dark:text-slate-400">When: </span>
            {appointment.date} at {timeOnly(appointment.time_start)}
            {appointment.service_type && ` · ${appointment.service_type}`}
          </p>
        )}
        {lead.status === 'booked' && !appointment && lead.booked_for && (
          <p className="text-sm text-ink-strong dark:text-slate-200">
            <span className="text-ink-muted dark:text-slate-400">When: </span>{lead.booked_for}
          </p>
        )}
        {lead.status === 'booked' && !appointment && !lead.booked_for && (
          <p className="text-sm italic text-ink-muted dark:text-slate-400">Flexible — no slot scheduled yet</p>
        )}
        {lead.status === 'done' && lead.work_description && (
          <p className="text-sm text-ink-strong dark:text-slate-200">
            <span className="text-ink-muted dark:text-slate-400">Work: </span>{lead.work_description}
          </p>
        )}
        {lead.notes && (
          <p className="text-sm text-ink-strong dark:text-slate-200">
            <span className="text-ink-muted dark:text-slate-400">Notes: </span>{lead.notes}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs !py-1.5">Edit</button>
          <button onClick={handleReopen} disabled={saving} className="btn-ghost text-xs !py-1.5">Move to Waiting</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {!isControlled && (
        <div className="flex items-stretch gap-2 mb-2">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2.5 text-sm transition shadow-card"
            aria-expanded={expanded}
          >
            <Icons.Check />
            {headerLabel}
            {headerMeta && (
              <span className="text-xs font-medium opacity-90">· {headerMeta.short}</span>
            )}
          </button>
          {onSpam && (
            <button
              type="button"
              onClick={onSpam}
              className="inline-flex items-center gap-1 rounded-xl bg-pastel-peach hover:bg-orange-200 text-pastel-peachDeep dark:bg-orange-500/15 dark:hover:bg-orange-500/25 dark:text-orange-300 font-semibold px-3 text-xs uppercase tracking-wide shrink-0"
              title="Mark this lead as spam and remove it"
            >
              <Icons.AlertTriangle /> Spam
            </button>
          )}
        </div>
      )}

      {expanded && showSummary && renderSummary()}

      {expanded && !showSummary && (
      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(OUTCOMES).map(([key, meta]) => {
            const label = meta.label
            const active = outcome === key
            return (
              <button
                key={key}
                onClick={() => setOutcome(key)}
                className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition border ${active
                  ? OUTCOME_ACTIVE_BTN_CLASS[key]
                  : 'bg-white dark:bg-slate-900 text-ink-strong dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {outcome === 'booked' && (
          <>
            {/* AI Assist */}
            <div className="rounded-xl border border-dashed border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5 px-3 py-2">
              {!aiOpen ? (
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="w-full text-left flex items-center justify-between gap-2 text-xs font-semibold text-brand-700 dark:text-brand-300"
                >
                  <span>✨ AI Assist — paste notes from your callback</span>
                  <span className="text-[11px] font-medium text-brand-600 dark:text-brand-400">Try it</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">✨ Paste notes (English or Russian)</p>
                    <button type="button" onClick={() => { setAiOpen(false); setAiText(''); setAiErr('') }} className="text-ink-muted hover:text-ink-strong dark:text-slate-400 dark:hover:text-slate-200">
                      <Icons.X />
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="e.g. Called Annie back, scheduling Tue 5/4 at 10am, washer not powering on, address 123 Oak St"
                    value={aiText}
                    onChange={e => setAiText(e.target.value)}
                    className="resize-y text-xs"
                  />
                  {aiErr && <p className="text-[11px] rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-2 py-1.5">{aiErr}</p>}
                  <button type="button" onClick={handleAiFill} disabled={aiBusy} className="btn-primary w-full text-xs !py-2">
                    {aiBusy ? 'Thinking…' : 'Fill fields from notes'}
                  </button>
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-muted dark:text-slate-400">
              Set a date <em>and</em> time below to put this on Mike&apos;s calendar (Max will see it).
              Leave them blank for a flexible booking — Mike can slot it in later.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-ink-muted dark:text-slate-400">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-ink-muted dark:text-slate-400">Time</label>
                <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} className="mt-1" />
              </div>
            </div>

            {!(date && timeStart) && (
              <div>
                <label className="text-xs text-ink-muted dark:text-slate-400">Or describe when (TBD, &quot;next week&quot;, etc.)</label>
                <input value={bookedFor} onChange={e => setBookedFor(e.target.value)} placeholder="TBD" className="mt-1" />
              </div>
            )}

            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">Service type</label>
              <input value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="Appliance Repair" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">Problem (optional)</label>
              <textarea rows={2} value={problem} onChange={e => setProblem(e.target.value)} placeholder="Brief description" className="mt-1" />
            </div>
          </>
        )}

        {outcome === 'done' && (
          <>
            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">Amount (optional)</label>
              <div className="relative mt-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500 text-sm">$</span>
                <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="pl-8" />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-muted dark:text-slate-400">What was done (optional)</label>
              <textarea rows={2} value={work} onChange={e => setWork(e.target.value)} placeholder="e.g. Replaced water heater element" className="mt-1" />
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-ink-muted dark:text-slate-400">Notes (optional)</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth remembering" className="mt-1" />
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs !py-2">
            {saving ? <Icons.Spinner /> : <Icons.Check />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          {isResolved && (
            <button onClick={() => setEditing(false)} disabled={saving} className="btn-ghost text-xs !py-2">Cancel</button>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
