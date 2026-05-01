import { fmtDate, fmtDuration, callDuration, isBooked, isWaiting, getCallerName, callOutputs } from '../utils/formatters'
import { OUTCOMES, fmtCents } from '../utils/resolutions'
import { phoneDigits, fmtPhone } from '../utils/phone'
import { buildCallbackSms } from '../utils/sms'
import SmsButton from './SmsButton'

function ResolutionPill({ resolution }) {
  if (!resolution) return null
  const meta = OUTCOMES[resolution.outcome]
  if (!meta) return null
  const money = resolution.outcome === 'done' ? fmtCents(resolution.amount_cents) : null
  return (
    <span className={`badge badge-${meta.tone}`}>
      ✓ {meta.short}{money ? ` · ${money}` : ''}
    </span>
  )
}

// Color of the left-edge stripe. Resolution outcome wins (it's the most
// recent operator-set state); fall back to Vapi's call-time state. No
// stripe (transparent) when there's nothing to surface.
function stripeColorClass(resolution, booked, waiting) {
  if (resolution) {
    const tone = OUTCOMES[resolution.outcome]?.tone
    if (tone === 'green') return 'bg-emerald-400'
    if (tone === 'blue')  return 'bg-sky-400'
    if (tone === 'red')   return 'bg-rose-400'
    return 'bg-slate-300 dark:bg-slate-600'
  }
  if (booked)  return 'bg-emerald-400'
  if (waiting) return 'bg-amber-400'
  return 'bg-transparent'
}

// "Booked Tue, May 4 at 2:00 PM" — assembled from whatever Vapi captured.
// Returns null when there's nothing concrete enough to surface.
function fmtAppointmentLine(o) {
  const d = (o.appointmentDate || '').trim()
  const t = (o.appointmentTime || '').trim()
  if (d && t) return `${d} at ${t}`
  if (d) return d
  if (t) return `at ${t}`
  return null
}

export default function CallRow({ call, resolution, active, onClick, shopName, ownerName }) {
  const name = getCallerName(call)
  const o = callOutputs(call)
  const spoken = o.customerPhone
  const callerId = call.customer?.number
  const phoneShown = spoken || callerId
  const phoneIsName = phoneShown && phoneShown === name
  const differ = spoken && callerId && phoneDigits(spoken) !== phoneDigits(callerId)
  const duration = callDuration(call)
  const booked = isBooked(call)
  const waiting = isWaiting(call)
  const resolved = !!resolution
  const smsBody = buildCallbackSms({ call, shopName, ownerName })

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  // Vapi-state pills are folded into the left stripe + status line below;
  // resolution still gets a pill on line 1 since it carries extra info
  // (outcome, $ amount). The status line is suppressed when resolved
  // because the pill already conveys the final state.
  const showStatusLine = !resolved && (booked || waiting)
  const apptLine = booked ? fmtAppointmentLine(o) : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`w-full text-left border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition cursor-pointer ${active ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-surface-muted dark:hover:bg-slate-800'}`}
    >
      <div className="flex items-stretch gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 relative">
        {/* Left-edge color stripe — at-a-glance status indicator. */}
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-1 ${stripeColorClass(resolution, booked, waiting)}`}
        />

        <div className="h-10 w-10 shrink-0 rounded-xl bg-pastel-lavender text-pastel-lavDeep dark:bg-indigo-500/20 dark:text-indigo-300 flex items-center justify-center font-semibold text-sm self-center">
          {name?.charAt(0)?.toUpperCase() || '?'}
        </div>

        <div className="flex-1 min-w-0 self-center">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-strong dark:text-slate-100 text-sm truncate">{name}</span>
            <ResolutionPill resolution={resolution} />
          </div>

          {/* Phone line — shown only when we have a phone distinct from
              the displayed name (so we don't print the same digits twice
              and so the date doesn't double up further down). */}
          {phoneShown && !phoneIsName && (
            <p className="text-sm sm:text-xs text-ink-muted dark:text-slate-400 mt-0.5 truncate font-medium sm:font-normal tabular-nums">
              {fmtPhone(phoneShown)}
              {differ && (
                <span className="ml-1.5 text-ink-faint dark:text-slate-500 font-normal">· from {fmtPhone(callerId)}</span>
              )}
            </p>
          )}

          {/* Status line — replaces old pill badges with descriptive
              text. Booked surfaces the appointment when Vapi captured
              one; waiting just says "Waiting on callback." */}
          {showStatusLine && booked && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
              <span className="mr-1">📅</span>
              Booked{apptLine ? ` · ${apptLine}` : ''}
            </p>
          )}
          {showStatusLine && !booked && waiting && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-0.5 truncate">
              <span className="mr-1">⏳</span>
              Waiting on callback
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 sm:hidden">
            <span className="text-[11px] text-ink-muted dark:text-slate-400 tabular-nums">
              {fmtDate(call.createdAt)} · {duration !== null ? fmtDuration(duration) : '—'}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <p className="text-xs text-ink-muted dark:text-slate-400 w-32 text-right">{fmtDate(call.createdAt)}</p>
          <p className="text-xs text-ink-muted dark:text-slate-400 tabular-nums w-14 text-center">
            {duration !== null ? fmtDuration(duration) : '—'}
          </p>
        </div>

        <SmsButton phone={phoneShown} body={smsBody} size="row" label={`Text ${name}`} />
      </div>
    </div>
  )
}
