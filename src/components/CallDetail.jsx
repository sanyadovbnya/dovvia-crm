import { fmtDate, fmtDuration, callDuration, parseTranscript } from '../utils/formatters'
import { EndReasonBadge, AppointmentBadge } from './Badges'
import { Icons } from './Icons'

function Section({ title, children }) {
  return (
    <div>
      <p style={{
        fontSize: 11, fontWeight: 600, color: '#475569',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        {title}
      </p>
      <div style={{
        background: '#0f1117', borderRadius: 10, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
        border: '1px solid #1a1d2e',
      }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, icon }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ minWidth: 76, fontSize: 12, color: '#475569', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{value}
      </span>
    </div>
  )
}

export default function CallDetail({ call, onClose }) {
  const sd = call.analysis?.structuredData || {}
  const summary = call.analysis?.summary
  const transcript = call.artifact?.transcript
  const recording = call.artifact?.recordingUrl
  const duration = callDuration(call)
  const messages = parseTranscript(transcript)

  const hasCustomerInfo = sd.customerName || sd.phoneNumber || sd.address || call.customer?.number
  const hasApptInfo = sd.applianceType || sd.problem || sd.timeSlot

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 49 }}
      />

      {/* Panel */}
      <div
        className="slide-in"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 520,
          background: '#13162b', borderLeft: '1px solid #1e2347',
          overflowY: 'auto', zIndex: 50,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #1e2347',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: '#13162b', zIndex: 10,
        }}>
          <div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
              Call · {fmtDate(call.createdAt)}
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
              {sd.customerName || call.customer?.number || 'Unknown Caller'}
            </h2>
            {call.customer?.number && sd.customerName && (
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                {call.customer.number}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#1e2347', border: 'none', borderRadius: 8,
              padding: 8, color: '#94a3b8', marginTop: 2,
            }}
          >
            <Icons.X />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Status row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <EndReasonBadge reason={call.endedReason} />
            {sd.appointmentBooked !== undefined && (
              <AppointmentBadge value={sd.appointmentBooked} />
            )}
            {duration !== null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                <Icons.Clock /> {fmtDuration(duration)}
              </span>
            )}
          </div>

          {/* Customer Info */}
          {hasCustomerInfo && (
            <Section title="Customer Info">
              <InfoRow label="Name" value={sd.customerName} />
              <InfoRow label="Phone" value={sd.phoneNumber || call.customer?.number} />
              <InfoRow label="Address" value={sd.address} icon={<Icons.MapPin />} />
            </Section>
          )}

          {/* Appointment Details */}
          {hasApptInfo && (
            <Section title="Appointment Details">
              <InfoRow label="Appliance" value={sd.applianceType} />
              <InfoRow label="Problem" value={sd.problem} />
              <InfoRow label="Time Slot" value={sd.timeSlot} />
            </Section>
          )}

          {/* Recording */}
          {recording && (
            <Section title="Recording">
              <audio controls style={{ width: '100%', borderRadius: 8, marginTop: 4 }} src={recording}>
                Your browser does not support the audio element.
              </audio>
            </Section>
          )}

          {/* Summary */}
          {summary && (
            <Section title="Call Summary">
              <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>{summary}</p>
            </Section>
          )}

          {/* Transcript */}
          {messages.length > 0 && (
            <Section title="Transcript">
              <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      minWidth: 56, fontSize: 11, fontWeight: 600, paddingTop: 2,
                      color: msg.role === 'assistant' ? '#818cf8' : '#34d399',
                      textTransform: 'capitalize',
                    }}>
                      {msg.role === 'assistant' ? 'Max' : 'Caller'}
                    </span>
                    <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{msg.text}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Raw structured data */}
          {Object.keys(sd).length > 0 && (
            <details>
              <summary style={{ fontSize: 12, color: '#475569', cursor: 'pointer', padding: '6px 0' }}>
                Raw structured data
              </summary>
              <pre style={{
                fontSize: 11, color: '#64748b', background: '#0f1117',
                padding: 12, borderRadius: 8, marginTop: 8, overflow: 'auto',
              }}>
                {JSON.stringify(sd, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </>
  )
}
