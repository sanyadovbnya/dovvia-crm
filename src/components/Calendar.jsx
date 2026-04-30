import { useState, useEffect, useCallback } from 'react'
import { fetchAppointments, createAppointment, cancelAppointment, rescheduleAppointment } from '../utils/appointments'
import { fmtTime } from '../utils/formatters'
import { AppointmentForm, AppointmentDetail, Modal } from './AppointmentModal'
import { Icons } from './Icons'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7) // 7a - 6p

const SERVICE_TONE = {
  'Appliance Repair':       'bg-pastel-peach    text-pastel-peachDeep border-orange-200',
  'HVAC':                   'bg-pastel-mint     text-pastel-mintDeep  border-emerald-200',
  'Plumbing':               'bg-pastel-sky      text-pastel-skyDeep   border-blue-200',
  'Electrical':             'bg-amber-100       text-amber-800        border-amber-200',
  'Cleaning':               'bg-pastel-lavender text-pastel-lavDeep   border-indigo-200',
  'Landscaping':            'bg-green-100       text-green-800        border-green-200',
  'Pest Control':           'bg-pastel-coral    text-pastel-coralDeep border-red-200',
  'Locksmith':              'bg-orange-100      text-orange-800       border-orange-200',
  'General Home Services':  'bg-slate-100       text-slate-700        border-slate-200',
  'Other':                  'bg-slate-100       text-slate-700        border-slate-200',
}

function toneFor(type) {
  return SERVICE_TONE[type] || SERVICE_TONE.Other
}

function getWeekDays(date) {
  const d = new Date(date)
  const day = d.getDay()
  const start = new Date(d)
  start.setDate(d.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(start)
    dd.setDate(start.getDate() + i)
    return dd
  })
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function timeToRow(t) {
  const [h, m] = t.split(':').map(Number)
  return (h - 7) * 4 + Math.floor(m / 15)
}

export default function Calendar() {
  const [weekOf, setWeekOf] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const days = getWeekDays(weekOf)
  const startStr = toDateStr(days[0])
  const endStr = toDateStr(days[6])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAppointments(startStr, endStr)
      setAppointments(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr])

  useEffect(() => { load() }, [load])

  function prevWeek() { setWeekOf(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekOf(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }
  function goToday()  { const n = new Date(); n.setHours(0,0,0,0); setWeekOf(n) }

  async function handleCreate(form) {
    setSaving(true)
    try { await createAppointment(form); setModal(null); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  async function handleCancel(id) {
    setSaving(true)
    try { await cancelAppointment(id); setModal(null); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  async function handleReschedule(id, date, ts, te) {
    setSaving(true)
    try { await rescheduleAppointment(id, date, ts, te); setModal(null); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const today = toDateStr(new Date())

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="h-9 w-9 rounded-xl bg-white hover:bg-surface-muted border border-slate-100 flex items-center justify-center text-ink-base dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-300" title="Previous week">
            <span className="rotate-180 inline-block"><Icons.ChevronRight /></span>
          </button>
          <button onClick={goToday} className="btn-ghost tabular-nums" title="Jump to current week">
            {(() => {
              const pad = n => String(n).padStart(2, '0')
              const fmt = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
              return `${fmt(days[0])} – ${fmt(days[6])}`
            })()}
          </button>
          <button onClick={nextWeek} className="h-9 w-9 rounded-xl bg-white hover:bg-surface-muted border border-slate-100 flex items-center justify-center text-ink-base dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-300" title="Next week">
            <Icons.ChevronRight />
          </button>
          <h2 className="ml-2 text-lg font-bold text-ink-strong dark:text-slate-100">
            {days[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
        </div>
        <button onClick={() => setModal({ type: 'new', date: today })} className="btn-primary">
          + New Appointment
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold"><Icons.X /></button>
        </div>
      )}

      {/* ============ MOBILE: agenda list ============ */}
      <div className="lg:hidden space-y-4">
        {days.map(d => {
          const dateStr = toDateStr(d)
          const dayAppts = appointments
            .filter(a => a.date === dateStr)
            .sort((a, b) => a.time_start.localeCompare(b.time_start))
          const isToday = dateStr === today

          return (
            <div key={dateStr} className={`card p-4 ${isToday ? 'ring-2 ring-brand-300 dark:ring-brand-500/50' : ''}`}>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-ink-muted dark:text-slate-400'}`}>
                    {d.toLocaleDateString('en-US', { weekday: 'long' })} {isToday && '· Today'}
                  </p>
                  <p className="text-xl font-bold text-ink-strong dark:text-slate-100 mt-0.5">
                    {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => setModal({ type: 'new', date: dateStr })}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  + Add
                </button>
              </div>

              {dayAppts.length === 0 ? (
                <p className="text-sm text-ink-faint dark:text-slate-500 py-3">No appointments.</p>
              ) : (
                <div className="space-y-2">
                  {dayAppts.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setModal({ type: 'detail', appt: a })}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition hover:shadow-card ${toneFor(a.service_type)}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm truncate">{a.customer_name}</p>
                        <p className="text-xs font-medium tabular-nums">{fmtTime(a.time_start)}</p>
                      </div>
                      <p className="text-xs opacity-80 truncate">{a.service_type}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ============ DESKTOP: week grid ============ */}
      <div className="hidden lg:block card overflow-hidden">
        {/* Day header row */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-100 dark:border-slate-800">
          <div />
          {days.map(d => {
            const isToday = toDateStr(d) === today
            return (
              <div
                key={d.toISOString()}
                className={`py-3 text-center border-l border-slate-100 dark:border-slate-800 ${isToday ? 'bg-brand-50 dark:bg-brand-500/10' : ''}`}
              >
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-ink-muted dark:text-slate-400'}`}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-brand-700 dark:text-brand-300' : 'text-ink-strong dark:text-slate-100'}`}>
                  {d.getDate()}
                </p>
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div className="max-h-[620px] overflow-y-auto">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] relative">
            {/* Time labels column */}
            <div>
              {HOURS.map(h => (
                <div key={h} className="h-16 flex items-start justify-end pr-2 pt-1 text-[11px] text-ink-faint dark:text-slate-500 border-b border-slate-50 dark:border-slate-800/70">
                  {h % 12 || 12}{h < 12 ? 'a' : 'p'}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(d => {
              const dateStr = toDateStr(d)
              const dayAppts = appointments.filter(a => a.date === dateStr)
              const isToday = dateStr === today

              return (
                <div
                  key={dateStr}
                  onClick={() => setModal({ type: 'new', date: dateStr })}
                  className={`relative border-l border-slate-100 dark:border-slate-800 cursor-pointer ${isToday ? 'bg-brand-50/40 dark:bg-brand-500/5' : ''}`}
                >
                  {HOURS.map(h => (
                    <div key={h} className="h-16 border-b border-slate-50 dark:border-slate-800/70" />
                  ))}

                  {dayAppts.map(appt => {
                    const startRow = timeToRow(appt.time_start)
                    const endRow   = timeToRow(appt.time_end)
                    const top      = startRow * 16
                    const height   = Math.max((endRow - startRow) * 16, 28)
                    return (
                      <button
                        key={appt.id}
                        onClick={e => { e.stopPropagation(); setModal({ type: 'detail', appt }) }}
                        style={{ top, height }}
                        className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-left overflow-hidden transition hover:shadow-card ${toneFor(appt.service_type)}`}
                      >
                        <p className="text-[11px] font-semibold leading-tight truncate">{appt.customer_name}</p>
                        {height > 32 && (
                          <p className="text-[10px] mt-0.5 opacity-80">{fmtTime(appt.time_start)}</p>
                        )}
                        {height > 52 && (
                          <p className="text-[10px] mt-0.5 opacity-70 truncate">{appt.service_type}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {loading && appointments.length === 0 && (
        <div className="text-center py-10 text-ink-faint dark:text-slate-500">
          <span className="spinner inline-block mb-2"><Icons.Spinner /></span>
          <p>Loading appointments…</p>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'new' && (
        <Modal title="New Appointment" onClose={() => setModal(null)}>
          <AppointmentForm
            initial={{ date: modal.date }}
            onSave={handleCreate}
            onClose={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {modal?.type === 'detail' && (
        <Modal onClose={() => setModal(null)}>
          <AppointmentDetail
            appt={modal.appt}
            onCancel={() => handleCancel(modal.appt.id)}
            onReschedule={(date, ts, te) => handleReschedule(modal.appt.id, date, ts, te)}
            onClose={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  )
}
