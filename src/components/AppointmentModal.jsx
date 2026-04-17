import { useState } from 'react'
import { Icons } from './Icons'

const SERVICE_TYPES = [
  'Appliance Repair', 'HVAC', 'Plumbing', 'Electrical',
  'Cleaning', 'Landscaping', 'Pest Control', 'Locksmith',
  'General Home Services', 'Other',
]

export function AppointmentForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    customer_name: initial?.customer_name || '',
    customer_phone: initial?.customer_phone || '',
    customer_address: initial?.customer_address || '',
    service_type: initial?.service_type || 'Appliance Repair',
    problem: initial?.problem || '',
    date: initial?.date || '',
    time_start: initial?.time_start?.slice(0, 5) || '09:00',
    time_end: initial?.time_end?.slice(0, 5) || '10:00',
    notes: initial?.notes || '',
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Customer Name *</label>
          <input required value={form.customer_name} onChange={set('customer_name')} style={inp} />
        </div>
        <div>
          <label style={lbl}>Phone</label>
          <input type="tel" value={form.customer_phone} onChange={set('customer_phone')} style={inp} />
        </div>
      </div>
      <div>
        <label style={lbl}>Address</label>
        <input value={form.customer_address} onChange={set('customer_address')} style={inp} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Service Type</label>
          <select value={form.service_type} onChange={set('service_type')} style={inp}>
            {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Date *</label>
          <input required type="date" value={form.date} onChange={set('date')} style={inp} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Start Time *</label>
          <input required type="time" value={form.time_start} onChange={set('time_start')} style={inp} />
        </div>
        <div>
          <label style={lbl}>End Time *</label>
          <input required type="time" value={form.time_end} onChange={set('time_end')} style={inp} />
        </div>
      </div>
      <div>
        <label style={lbl}>Problem / Notes</label>
        <textarea value={form.problem} onChange={set('problem')} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="submit" disabled={saving} style={{
          flex: 1, padding: '11px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, #E8952E, #D4811F)',
          color: '#fff', fontWeight: 600, fontSize: 14,
        }}>
          {saving ? 'Saving…' : (initial ? 'Save Changes' : 'Create Appointment')}
        </button>
        <button type="button" onClick={onClose} style={{
          padding: '11px 20px', borderRadius: 8, border: '1px solid #2d3148',
          background: '#1e2347', color: '#94a3b8', fontWeight: 500, fontSize: 14,
        }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function AppointmentDetail({ appt, onReschedule, onCancel, onClose, saving }) {
  const [mode, setMode] = useState('view')
  const [reschedule, setReschedule] = useState({
    date: appt.date,
    time_start: appt.time_start?.slice(0, 5),
    time_end: appt.time_end?.slice(0, 5),
  })

  if (mode === 'reschedule') {
    return (
      <>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Reschedule Appointment</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>New Date</label>
            <input type="date" value={reschedule.date} onChange={e => setReschedule(r => ({ ...r, date: e.target.value }))} style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Start Time</label>
              <input type="time" value={reschedule.time_start} onChange={e => setReschedule(r => ({ ...r, time_start: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>End Time</label>
              <input type="time" value={reschedule.time_end} onChange={e => setReschedule(r => ({ ...r, time_end: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button disabled={saving} onClick={() => onReschedule(reschedule.date, reschedule.time_start, reschedule.time_end)} style={{
              flex: 1, padding: '11px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #E8952E, #D4811F)',
              color: '#fff', fontWeight: 600, fontSize: 14,
            }}>
              {saving ? 'Saving…' : 'Confirm Reschedule'}
            </button>
            <button onClick={() => setMode('view')} style={{
              padding: '11px 20px', borderRadius: 8, border: '1px solid #2d3148',
              background: '#1e2347', color: '#94a3b8', fontWeight: 500, fontSize: 14,
            }}>
              Back
            </button>
          </div>
        </div>
      </>
    )
  }

  const statusColors = {
    scheduled: { bg: '#0a1628', color: '#60a5fa', border: '#1e3a5f' },
    completed: { bg: '#052e16', color: '#4ade80', border: '#166534' },
    cancelled: { bg: '#2d0a0a', color: '#f87171', border: '#7f1d1d' },
    rescheduled: { bg: '#2d1f00', color: '#fbbf24', border: '#78350f' },
  }
  const sc = statusColors[appt.status] || statusColors.scheduled

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{appt.customer_name}</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{appt.service_type}</p>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
        }}>
          {appt.status}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <Row label="Date" value={new Date(appt.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} />
        <Row label="Time" value={`${fmtTime(appt.time_start)} – ${fmtTime(appt.time_end)}`} />
        {appt.customer_phone && <Row label="Phone" value={appt.customer_phone} />}
        {appt.customer_address && <Row label="Address" value={appt.customer_address} />}
        {appt.problem && <Row label="Issue" value={appt.problem} />}
        {appt.notes && <Row label="Notes" value={appt.notes} />}
      </div>

      {appt.status === 'scheduled' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setMode('reschedule')} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #2d3148',
            background: '#1e2347', color: '#E8952E', fontWeight: 600, fontSize: 13,
          }}>
            Reschedule
          </button>
          <button disabled={saving} onClick={onCancel} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #7f1d1d',
            background: '#2d0a0a', color: '#f87171', fontWeight: 600, fontSize: 13,
          }}>
            {saving ? 'Cancelling…' : 'Cancel Appointment'}
          </button>
        </div>
      )}

      <button onClick={onClose} style={{
        width: '100%', marginTop: 10, padding: '10px', borderRadius: 8,
        border: '1px solid #2d3148', background: 'transparent', color: '#94a3b8',
        fontSize: 13,
      }}>
        Close
      </button>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ minWidth: 70, fontSize: 12, color: '#475569' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#cbd5e1' }}>{value}</span>
    </div>
  )
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function Modal({ title, children, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99 }} />
      <div className="fade-in" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#13162b', border: '1px solid #1e2347', borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        zIndex: 100, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{title}</h2>
            <button onClick={onClose} style={{
              background: '#1e2347', border: 'none', borderRadius: 8, padding: 6, color: '#94a3b8',
            }}>
              <Icons.X />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  )
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }
const inp = { height: 40, fontSize: 13 }
