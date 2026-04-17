import { fmtDate, fmtDuration, callDuration, isBooked, getCallerName, callOutputs } from '../utils/formatters'
import { EndReasonBadge } from './Badges'
import { Icons } from './Icons'

export default function CallRow({ call, active, onClick }) {
  const name = getCallerName(call)
  const o = callOutputs(call)
  const phone = o.customerPhone || call.customer?.number
  const duration = callDuration(call)
  const booked = isBooked(call)

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 140px 110px 70px 24px',
        alignItems: 'center',
        gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid #1a1d2e',
        cursor: 'pointer',
        background: active ? '#1a1d2e' : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#161929' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Name + booked badge */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{name}</span>
          {booked && <span className="badge badge-green">Booked</span>}
        </div>
        <p style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
          {phone && phone !== name ? phone : fmtDate(call.createdAt)}
        </p>
      </div>

      {/* Date */}
      <p style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(call.createdAt)}</p>

      {/* Status */}
      <div><EndReasonBadge reason={call.endedReason} /></div>

      {/* Duration */}
      <p style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
        {duration !== null ? fmtDuration(duration) : '—'}
      </p>

      {/* Arrow */}
      <span style={{ color: '#3d4466' }}><Icons.ChevronRight /></span>
    </div>
  )
}
