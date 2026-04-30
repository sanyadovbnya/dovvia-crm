import { useState } from 'react'
import { fmtDate, fmtDuration, callDuration, parseTranscript, callOutputs, isWaiting } from '../utils/formatters'
import { aiParseInvoice, buildInvoiceDraftFromCall, buildAIContextFromCall } from '../utils/invoices'
import { phoneDigits } from '../utils/phone'
import { EndReasonBadge, AppointmentBadge } from './Badges'
import { Icons } from './Icons'
import ResolutionForm from './ResolutionForm'

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">
        {title}
      </p>
      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-2">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, icon }) {
  if (!value) return null
  return (
    <div className="flex gap-3 items-start">
      <span className="min-w-[76px] text-xs text-ink-muted dark:text-slate-400 pt-0.5">{label}</span>
      <span className="text-sm text-ink-strong dark:text-slate-100 flex items-center gap-1.5 break-words">
        {icon && <span className="text-ink-faint dark:text-slate-500">{icon}</span>}
        {value}
      </span>
    </div>
  )
}


function GenerateInvoiceButton({ call, outputs, resolution, onGenerateInvoice }) {
  const [busy, setBusy] = useState(false)
  const baseline = buildInvoiceDraftFromCall(call, outputs, resolution)

  // Worth running AI? Only when there's diagnostic context worth polishing.
  const aiWorthwhile =
    resolution?.outcome === 'done' &&
    (resolution.work_description || outputs.problem)

  async function handleClick() {
    setBusy(true)
    try {
      let draft = baseline
      if (aiWorthwhile) {
        try {
          const ai = await aiParseInvoice(buildAIContextFromCall(call, outputs, resolution))
          draft = {
            ...baseline,
            // Keep deterministic customer fields; only let AI fill if we have nothing.
            customer_name:    baseline.customer_name    || ai.customer_name    || '',
            customer_phone:   baseline.customer_phone   || ai.customer_phone   || '',
            customer_address: baseline.customer_address || ai.customer_address || '',
            serviced_unit:    ai.serviced_unit || baseline.serviced_unit,
            line_items:       ai.line_items?.length ? ai.line_items.map(l => ({
              description: l.description || '',
              amount: l.amount ?? '',
            })) : baseline.line_items,
            tax_rate:         ai.tax_rate ?? undefined,
            notes:            ai.notes || baseline.notes,
          }
        } catch { /* AI failed — fall through with baseline silently */ }
      }
      onGenerateInvoice(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="btn-primary w-full"
    >
      {busy
        ? <><Icons.Spinner /> {aiWorthwhile ? 'Drafting with AI…' : 'Preparing…'}</>
        : <><Icons.Receipt /> Generate Invoice{aiWorthwhile ? ' ✨' : ''}</>}
    </button>
  )
}

export default function CallDetail({ call, resolution, onResolutionChange, onGenerateInvoice, onClose }) {
  const o = callOutputs(call)
  const summary = o.callSummary || call.analysis?.summary
  const transcript = call.artifact?.transcript
  const recording = call.artifact?.recordingUrl
  const duration = callDuration(call)
  const messages = parseTranscript(transcript)

  const spoken = o.customerPhone
  const callerId = call.customer?.number
  const phonesDiffer = spoken && callerId && phoneDigits(spoken) !== phoneDigits(callerId)

  const hasCustomerInfo = o.customerName || spoken || o.customerAddress || callerId
  const hasApptInfo = o.serviceType || o.problem || o.appointmentDate || o.appointmentTime

  const name = o.customerName || callerId || 'Unknown Caller'
  const initial = name.charAt(0).toUpperCase()

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/60 backdrop-blur-sm"
      />

      {/* Panel */}
      <aside className="slide-in fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-surface-card dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 overflow-y-auto flex flex-col shadow-pop">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-surface-card/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-pastel-lavender text-pastel-lavDeep dark:bg-indigo-500/20 dark:text-indigo-300 flex items-center justify-center font-bold">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted dark:text-slate-400">Call · {fmtDate(call.createdAt)}</p>
              <h2 className="text-lg font-bold text-ink-strong dark:text-slate-100 truncate">{name}</h2>
              {call.customer?.number && o.customerName && (
                <p className="text-xs text-ink-muted dark:text-slate-400 truncate">{call.customer.number}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2">
            <Icons.X />
          </button>
        </header>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Status row */}
          <div className="flex gap-2 flex-wrap items-center">
            <EndReasonBadge reason={call.endedReason} />
            {o.appointmentBooked !== undefined && <AppointmentBadge value={o.appointmentBooked} />}
            {isWaiting(call) && <span className="badge badge-yellow">Waiting on callback</span>}
            {duration !== null && (
              <span className="flex items-center gap-1 text-xs text-ink-muted dark:text-slate-400">
                <Icons.Clock /> {fmtDuration(duration)}
              </span>
            )}
          </div>

          {/* Quick actions */}
          {onGenerateInvoice && (
            <GenerateInvoiceButton
              call={call}
              outputs={o}
              resolution={resolution}
              onGenerateInvoice={onGenerateInvoice}
            />
          )}

          {/* Resolution */}
          <ResolutionForm
            callId={call.id}
            resolution={resolution}
            onSaved={onResolutionChange}
          />

          {/* Customer Info */}
          {hasCustomerInfo && (
            <Section title="Customer">
              <InfoRow label="Name"    value={o.customerName} />
              <InfoRow label={phonesDiffer ? 'Callback' : 'Phone'} value={spoken || callerId} />
              {phonesDiffer && <InfoRow label="Called from" value={callerId} />}
              <InfoRow label="Address" value={o.customerAddress} icon={<Icons.MapPin />} />
            </Section>
          )}

          {/* Appointment Details */}
          {hasApptInfo && (
            <Section title="Appointment">
              <InfoRow label="Service" value={o.serviceType} />
              <InfoRow label="Problem" value={o.problem} />
              <InfoRow label="Date"    value={o.appointmentDate} />
              <InfoRow label="Time"    value={o.appointmentTime} />
            </Section>
          )}

          {/* Recording */}
          {recording && (
            <Section title="Recording">
              <audio controls className="w-full rounded-lg mt-1" src={recording}>
                Your browser does not support the audio element.
              </audio>
            </Section>
          )}

          {/* Summary */}
          {summary && (
            <Section title="Call Summary">
              <p className="text-sm text-ink-strong dark:text-slate-200 leading-relaxed">{summary}</p>
            </Section>
          )}

          {/* Transcript */}
          {messages.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">
                Transcript
              </p>
              <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
                {messages.map((msg, i) => {
                  const isAssistant = msg.role === 'assistant'
                  return (
                    <div key={i} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        isAssistant
                          ? 'bg-white dark:bg-slate-900 text-ink-strong dark:text-slate-100 rounded-bl-sm shadow-card dark:ring-1 dark:ring-slate-800'
                          : 'bg-brand-500 text-white rounded-br-sm'
                      }`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${
                          isAssistant ? 'text-ink-muted dark:text-slate-400' : 'text-white/75'
                        }`}>
                          {isAssistant ? 'Dovvia' : 'Caller'}
                        </p>
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Raw structured outputs */}
          {Object.keys(o).length > 0 && (
            <details className="group">
              <summary className="text-xs text-ink-muted dark:text-slate-400 cursor-pointer py-1.5 list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition"><Icons.ChevronRight /></span>
                Raw structured outputs
              </summary>
              <pre className="mt-2 text-[11px] text-ink-muted dark:text-slate-400 bg-surface-muted dark:bg-slate-800/60 p-3 rounded-xl overflow-auto">
                {JSON.stringify(o, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </aside>
    </>
  )
}
