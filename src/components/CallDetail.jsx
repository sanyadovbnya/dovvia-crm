import { useState, useEffect, useRef } from 'react'
import { fmtDate, fmtDuration, callDuration, parseTranscript, callOutputs, isWaiting } from '../utils/formatters'
import { aiParseInvoice, buildInvoiceDraftFromCall, buildAIContextFromCall } from '../utils/invoices'
import { phoneDigits, fmtPhone } from '../utils/phone'
import { buildCallbackSms } from '../utils/sms'
import { EndReasonBadge, AppointmentBadge } from './Badges'
import { Icons } from './Icons'
import ResolutionForm from './ResolutionForm'
import ResolutionToggleButton from './ResolutionToggleButton'
import SmsButton from './SmsButton'
import useDismissOnBack from '../utils/useDismissOnBack'
import { translateText } from '../utils/translate'

function Section({ title, action, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">
          {title}
        </p>
        {action}
      </div>
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


function GenerateInvoiceButton({ call, outputs, resolution, onGenerateInvoice, className = '' }) {
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
      className={`btn-primary w-full ${className}`}
    >
      {busy
        ? <><Icons.Spinner /> {aiWorthwhile ? 'Drafting with AI…' : 'Preparing…'}</>
        : <><Icons.Receipt /> Generate Invoice{aiWorthwhile ? ' ✨' : ''}</>}
    </button>
  )
}

export default function CallDetail({ call, resolution, onResolutionChange, onGenerateInvoice, onClose, shopName, ownerName }) {
  // iOS swipe-back / browser back closes the panel instead of unloading
  // the dashboard route.
  useDismissOnBack(onClose)
  const [resolutionOpen, setResolutionOpen] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)
  // Recordings are big files — defer rendering the <audio> element until
  // the operator explicitly asks for it so opening a call doesn't burn
  // mobile data on metadata fetches.
  const [recordingRequested, setRecordingRequested] = useState(false)
  // Russian translation of the call summary (cached per call so toggling
  // on/off doesn't re-hit OpenAI). The panel stays mounted across calls,
  // so reset everything when the call id changes.
  const [summaryRu, setSummaryRu] = useState('')
  const [showRu, setShowRu] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateErr, setTranslateErr] = useState('')
  useEffect(() => {
    setRecordingRequested(false)
    setResolutionOpen(false)
    setSummaryRu('')
    setShowRu(false)
    setTranslating(false)
    setTranslateErr('')
  }, [call.id])

  // Hold the "Copied!" timer in a ref so unmounting/switching calls cancels
  // it cleanly — otherwise the setState would fire on a stale component.
  const copiedTimerRef = useRef(null)
  useEffect(() => () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) }, [])

  // Toggles between English (the original captured by Vapi) and Russian.
  // Translation is fetched once per call and reused on every re-toggle.
  async function handleTranslateSummary() {
    if (showRu) { setShowRu(false); return }
    if (summaryRu) { setShowRu(true); return }
    if (!summary) return
    setTranslating(true); setTranslateErr('')
    try {
      const ru = await translateText(summary, 'ru')
      setSummaryRu(ru)
      setShowRu(true)
    } catch (e) {
      setTranslateErr(e.message || 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  // Copies the displayed (formatted) phone number to the clipboard so Mike
  // can paste it into another tool. The "Copied!" hint clears after 1.5s.
  async function handleCopyPhone(phone) {
    try {
      await navigator.clipboard.writeText(fmtPhone(phone))
      setCopiedPhone(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopiedPhone(false), 1500)
    } catch {
      // clipboard API blocked — fail silently; the number is still visible
    }
  }

  const o = callOutputs(call)
  const summary = o.callSummary || call.analysis?.summary
  const transcript = call.artifact?.transcript
  const recording = call.artifact?.recordingUrl
  const duration = callDuration(call)
  const messages = parseTranscript(transcript)

  const spoken = o.customerPhone
  const callerId = call.customer?.number
  const phonesDiffer = spoken && callerId && phoneDigits(spoken) !== phoneDigits(callerId)
  const primaryPhone = spoken || callerId

  const hasApptInfo = o.serviceType || o.problem || o.appointmentDate || o.appointmentTime

  const name = o.customerName || callerId || 'Unknown Caller'
  const initial = name.charAt(0).toUpperCase()
  const smsBody = buildCallbackSms({ call, shopName, ownerName })

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
          <button onClick={onClose} aria-label="Close" className="btn-ghost !p-2.5 h-11 w-11 shrink-0">
            <Icons.X size={24} />
          </button>
        </header>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Quick contact — phone (click to copy) + green SMS bubble.
              When the spoken callback number differs from the caller ID we
              show a small "Called from" note so the operator knows there
              are two valid contact numbers in play. */}
          {primaryPhone && (
            <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleCopyPhone(primaryPhone)}
                  title="Click to copy"
                  className="flex items-center gap-2 text-lg sm:text-xl font-bold text-ink-strong dark:text-slate-100 tabular-nums hover:text-brand-600 dark:hover:text-brand-400 transition min-w-0 text-left"
                >
                  <span className="text-brand-500 dark:text-brand-400 shrink-0">
                    {copiedPhone ? <Icons.Check /> : <Icons.Copy />}
                  </span>
                  <span className="truncate">{fmtPhone(primaryPhone)}</span>
                  {copiedPhone && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 normal-case tracking-normal">Copied!</span>
                  )}
                </button>
                <SmsButton phone={primaryPhone} body={smsBody} size="lg" label={`Text ${name}`} />
              </div>
              {phonesDiffer && (
                <p className="mt-1 text-[11px] text-ink-muted dark:text-slate-400 tabular-nums">
                  Called from {fmtPhone(callerId)}
                </p>
              )}
            </div>
          )}

          {/* Call Summary — moved up here so the most-useful context (who
              called, what they wanted) is the first thing under the phone.
              Operator can flip the captured English summary to Russian on
              demand; the translation is cached per call. */}
          {summary && (
            <Section
              title="Call Summary"
              action={
                <button
                  type="button"
                  onClick={handleTranslateSummary}
                  disabled={translating}
                  className="text-[11px] font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200 transition disabled:opacity-60 normal-case tracking-normal"
                >
                  {translating
                    ? 'Translating…'
                    : (showRu ? 'Show original' : '🇷🇺 Перевести')}
                </button>
              }
            >
              <p className="text-sm text-ink-strong dark:text-slate-200 leading-relaxed">
                {showRu ? summaryRu : summary}
              </p>
              {translateErr && (
                <p className="text-[11px] rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-2 py-1.5 mt-2">
                  {translateErr}
                </p>
              )}
            </Section>
          )}

          {/* Standalone Address block — taps open Google Maps (deep-links to
              the native Maps app on iOS/Android when installed). Hidden when
              the call didn't capture an address. */}
          {o.customerAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customerAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Maps"
              className="flex items-center gap-3 rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition group"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pastel-sky text-pastel-skyDeep dark:bg-blue-500/20 dark:text-blue-300 shrink-0">
                <Icons.MapPin />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Address</p>
                <p className="text-sm font-medium text-ink-strong dark:text-slate-100 truncate">{o.customerAddress}</p>
              </div>
              <span className="text-ink-faint dark:text-slate-500 shrink-0 group-hover:text-ink-muted dark:group-hover:text-slate-300 transition">
                <Icons.ChevronRight />
              </span>
            </a>
          )}

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

          {/* Quick actions — Generate Invoice + Resolved share one row.
              Body of the resolution form expands below when toggled. */}
          <div className="flex gap-2">
            {onGenerateInvoice && (
              <GenerateInvoiceButton
                call={call}
                outputs={o}
                resolution={resolution}
                onGenerateInvoice={onGenerateInvoice}
                className="flex-1"
              />
            )}
            <ResolutionToggleButton
              outcome={resolution?.outcome}
              expanded={resolutionOpen}
              onToggle={() => setResolutionOpen(o => !o)}
              className="flex-1"
            />
          </div>

          <ResolutionForm
            callId={call.id}
            resolution={resolution}
            onSaved={onResolutionChange}
            expanded={resolutionOpen}
            onToggle={setResolutionOpen}
          />


          {/* Appointment Details */}
          {hasApptInfo && (
            <Section title="Appointment">
              <InfoRow label="Service" value={o.serviceType} />
              <InfoRow label="Problem" value={o.problem} />
              <InfoRow label="Date"    value={o.appointmentDate} />
              <InfoRow label="Time"    value={o.appointmentTime} />
            </Section>
          )}

          {/* Recording — fetched lazily on click so opening the call panel
              doesn't pull the audio file across mobile data. After the
              operator hits Load, the <audio> element mounts with autoPlay
              so the click feels like a single "play" gesture. */}
          {recording && (
            <Section title="Recording">
              {recordingRequested ? (
                <audio
                  controls
                  autoPlay
                  preload="metadata"
                  className="w-full rounded-lg mt-1"
                  src={recording}
                >
                  Your browser does not support the audio element.
                </audio>
              ) : (
                <button
                  type="button"
                  onClick={() => setRecordingRequested(true)}
                  className="btn-ghost w-full !py-2.5"
                >
                  <Icons.Microphone /> Load recording
                </button>
              )}
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
