import { useState, useEffect, useCallback } from 'react'
import { fetchAppointments, createAppointment, cancelAppointment, rescheduleAppointment } from '../utils/appointments'
import { AppointmentForm, AppointmentDetail, Modal } from './AppointmentModal'
import { Icons } from './Icons'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7)

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

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function timeToRow(t) {
  const [h, m] = t.split(':').map(Number)
  return (h - 7) * 4 + Math.floor(m / 15)
}

function apptColor(type) {
  const colors = {
    'Appliance Repair': '#E8952E',
    'HVAC': '#2BB5AD',
    'Plumbing': '#60a5fa',
    'Electrical': '#fbbf24',
    'Cleaning': '#a78bfa',
    'Landscaping': '#4ade80',
    'Pest Control': '#f87171',
    'Locksmith': '#fb923c',
  }
  return colors[type] || '#94a3b8'
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

  function prevWeek() {
    setWeekOf(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
  }
  function nextWeek() {
    setWeekOf(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
  }
  function goToday() {
    const now = new Date(); now.setHours(0, 0, 0, 0); setWeekOf(now)
  }

  async function handleCreate(form) {
    setSaving(true)
    try {
      await createAppointment(form)
      setModal(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(id) {
    setSaving(true)
    try {
      await cancelAppointment(id)
      setModal(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleReschedule(id, date, timeStart, timeEnd) {
    setSaving(true)
    try {
      await rescheduleAppointment(id, date, timeStart, timeEnd)
      setModal(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const today = toDateStr(new Date())

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevWeek} style={navBtn}>&lsaquo;</button>
          <button onClick={goToday} style={{ ...navBtn, padding: '6px 14px', fontSize: 13 }}>Today</button>
          <button onClick={nextWeek} style={navBtn}>&rsaquo;</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginLeft: 8 }}>
            {days[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>
        <button onClick={() => setModal({ type: 'new', date: today })} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, #E8952E, #D4811F)',
          color: '#fff', fontWeight: 600, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          + New Appointment
        </button>
      </div>

      {error && (
        <div style={{
          background: '#2d0a0a', border: '1px solid #7f1d1d',
          borderRadius: 10, padding: '10px 14px',
          color: '#f87171', fontSize: 13, marginBottom: 12,
        }}>
          {error}
          <button onClick={() => setError('')} style={{
            float: 'right', background: 'none', border: 'none', color: '#f87171', fontSize: 16,
          }}>×</button>
        </div>
      )}

      <div style={{
        background: '#13162b', border: '1px solid #1e2347',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Day headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '60px repeat(7, 1fr)',
          borderBottom: '1px solid #1e2347',
        }}>
          <div style={{ padding: '10px 0' }} />
          {days.map(d => {
            const isToday = toDateStr(d) === today
            return (
              <div key={d.toISOString()} style={{
                padding: '10px 8px', textAlign: 'center',
                borderLeft: '1px solid #1e2347',
                background: isToday ? 'rgba(232, 149, 46, 0.08)' : 'transparent',
              }}>
                <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 700, marginTop: 2,
                  color: isToday ? '#E8952E' : '#94a3b8',
                }}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px repeat(7, 1fr)',
            position: 'relative',
          }}>
            {/* Time labels */}
            <div>
              {HOURS.map(h => (
                <div key={h} style={{
                  height: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                  paddingRight: 8, paddingTop: 2,
                  fontSize: 11, color: '#475569',
                  borderBottom: '1px solid #1a1d2e',
                }}>
                  {h % 12 || 12}{h < 12 ? 'a' : 'p'}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((d, di) => {
              const dateStr = toDateStr(d)
              const dayAppts = appointments.filter(a => a.date === dateStr)
              const isToday = dateStr === today

              return (
                <div key={dateStr} style={{
                  position: 'relative',
                  borderLeft: '1px solid #1e2347',
                  background: isToday ? 'rgba(232, 149, 46, 0.04)' : 'transparent',
                  cursor: 'pointer',
                }} onClick={() => setModal({ type: 'new', date: dateStr })}>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      height: 60,
                      borderBottom: '1px solid #1a1d2e',
                    }} />
                  ))}

                  {dayAppts.map(appt => {
                    const startRow = timeToRow(appt.time_start)
                    const endRow = timeToRow(appt.time_end)
                    const top = startRow * 15
                    const height = Math.max((endRow - startRow) * 15, 24)
                    const color = apptColor(appt.service_type)

                    return (
                      <div
                        key={appt.id}
                        onClick={e => { e.stopPropagation(); setModal({ type: 'detail', appt }) }}
                        style={{
                          position: 'absolute', left: 2, right: 2, top, height,
                          background: color + '22',
                          border: `1px solid ${color}55`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 6, padding: '3px 6px',
                          overflow: 'hidden', cursor: 'pointer',
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {appt.customer_name}
                        </div>
                        {height > 30 && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                            {fmtTime(appt.time_start)}
                          </div>
                        )}
                        {height > 48 && (
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {appt.service_type}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {loading && appointments.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: '#475569' }}>
          <span className="spinner" style={{ display: 'inline-block', marginBottom: 8 }}><Icons.Spinner /></span>
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

const navBtn = {
  background: '#1e2347', border: 'none', borderRadius: 8,
  padding: '6px 10px', color: '#94a3b8', fontSize: 18, fontWeight: 600,
}
