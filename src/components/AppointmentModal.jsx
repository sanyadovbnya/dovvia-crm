import { useState } from 'react'
import { Icons } from './Icons'
import useDismissOnBack from '../utils/useDismissOnBack'

const SERVICE_TYPES = [
  'Appliance Repair', 'HVAC', 'Plumbing', 'Electrical',
  'Cleaning', 'Landscaping', 'Pest Control', 'Locksmith',
  'General Home Services', 'Other',
]

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-ink-strong dark:text-slate-200 mb-1.5">
      {children}{required && <span className="text-brand-500"> *</span>}
    </label>
  )
}

export function AppointmentForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    customer_name:    initial?.customer_name || '',
    customer_phone:   initial?.customer_phone || '',
    customer_address: initial?.customer_address || '',
    service_type:     initial?.service_type || 'Appliance Repair',
    problem:          initial?.problem || '',
    date:             initial?.date || '',
    time_start:       initial?.time_start?.slice(0, 5) || '10:00',
    time_end:         initial?.time_end?.slice(0, 5) || '12:00',
    notes:            initial?.notes || '',
  })

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))
  function handleSubmit(e) { e.preventDefault(); onSave(form) }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Customer name</Label>
          <input required value={form.customer_name} onChange={set('customer_name')} />
        </div>
        <div>
          <Label>Phone</Label>
          <input type="tel" value={form.customer_phone} onChange={set('customer_phone')} />
        </div>
      </div>

      <div>
        <Label>Address</Label>
        <input value={form.customer_address} onChange={set('customer_address')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Service type</Label>
          <select value={form.service_type} onChange={set('service_type')}>
            {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label required>Date</Label>
          <input required type="date" value={form.date} onChange={set('date')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Start</Label>
          <input required type="time" value={form.time_start} onChange={set('time_start')} />
        </div>
        <div>
          <Label required>End</Label>
          <input required type="time" value={form.time_end} onChange={set('time_end')} />
        </div>
      </div>

      <div>
        <Label>Problem / Notes</Label>
        <textarea value={form.problem} onChange={set('problem')} rows={2} className="resize-y" />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? 'Saving…' : (initial?.customer_name ? 'Save changes' : 'Create appointment')}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </form>
  )
}

const STATUS_TONE = {
  scheduled:   'bg-pastel-sky      text-pastel-skyDeep   dark:bg-blue-500/20     dark:text-blue-300',
  completed:   'bg-pastel-mint     text-pastel-mintDeep  dark:bg-emerald-500/20  dark:text-emerald-300',
  cancelled:   'bg-pastel-coral    text-pastel-coralDeep dark:bg-red-500/20      dark:text-red-300',
  rescheduled: 'bg-pastel-peach    text-pastel-peachDeep dark:bg-orange-500/20   dark:text-orange-300',
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="min-w-[68px] text-xs text-ink-muted dark:text-slate-400 pt-0.5">{label}</span>
      <span className="text-sm text-ink-strong dark:text-slate-100 break-words">{value}</span>
    </div>
  )
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function AppointmentDetail({ appt, onReschedule, onCancel, onClose, saving }) {
  const [mode, setMode] = useState('view')
  const [reschedule, setReschedule] = useState({
    date:       appt.date,
    time_start: appt.time_start?.slice(0, 5),
    time_end:   appt.time_end?.slice(0, 5),
  })

  if (mode === 'reschedule') {
    return (
      <>
        <h3 className="text-base font-bold text-ink-strong dark:text-slate-100 mb-4">Reschedule appointment</h3>
        <div className="space-y-3">
          <div>
            <Label>New date</Label>
            <input type="date" value={reschedule.date} onChange={e => setReschedule(r => ({ ...r, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <input type="time" value={reschedule.time_start} onChange={e => setReschedule(r => ({ ...r, time_start: e.target.value }))} />
            </div>
            <div>
              <Label>End</Label>
              <input type="time" value={reschedule.time_end} onChange={e => setReschedule(r => ({ ...r, time_end: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              disabled={saving}
              onClick={() => onReschedule(reschedule.date, reschedule.time_start, reschedule.time_end)}
              className="btn-primary flex-1"
            >
              {saving ? 'Saving…' : 'Confirm reschedule'}
            </button>
            <button onClick={() => setMode('view')} className="btn-ghost">Back</button>
          </div>
        </div>
      </>
    )
  }

  const statusClass = STATUS_TONE[appt.status] || STATUS_TONE.scheduled

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink-strong dark:text-slate-100 truncate">{appt.customer_name}</h3>
          <p className="text-sm text-ink-muted dark:text-slate-400 mt-0.5">{appt.service_type}</p>
        </div>
        <span className={`badge ${statusClass}`}>{appt.status}</span>
      </div>

      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-2.5 mb-5">
        <Row label="Date" value={new Date(appt.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} />
        <Row label="Time" value={`${fmtTime(appt.time_start)} – ${fmtTime(appt.time_end)}`} />
        {appt.customer_phone && <Row label="Phone" value={appt.customer_phone} />}
        {appt.customer_address && <Row label="Address" value={appt.customer_address} />}
        {appt.problem && <Row label="Issue" value={appt.problem} />}
        {appt.notes && <Row label="Notes" value={appt.notes} />}
      </div>

      {appt.status === 'scheduled' && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode('reschedule')}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-pastel-peach text-pastel-peachDeep hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/25 transition"
          >
            Reschedule
          </button>
          <button
            disabled={saving}
            onClick={onCancel}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-pastel-coral text-pastel-coralDeep hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25 transition"
          >
            {saving ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      )}

      <button onClick={onClose} className="btn-ghost w-full mt-2">Close</button>
    </>
  )
}

export function Modal({ title, children, onClose }) {
  // Swipe-back / browser-back closes the modal instead of leaving the page.
  useDismissOnBack(onClose)
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" />
      <div className="fade-in fixed z-50 inset-0 flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
        <div className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-6 pointer-events-auto rounded-t-xl2 sm:rounded-xl2 shadow-pop">
          {title && (
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-ink-strong dark:text-slate-100">{title}</h2>
              <button onClick={onClose} className="btn-ghost !p-2"><Icons.X /></button>
            </div>
          )}
          {children}
        </div>
      </div>
    </>
  )
}
