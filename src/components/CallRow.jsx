import { fmtDate, fmtDuration, callDuration, isBooked, isWaiting, getCallerName, callOutputs } from '../utils/formatters'
import { OUTCOMES, fmtCents } from '../utils/resolutions'
import { phoneDigits, fmtPhone } from '../utils/phone'
import { buildCallbackSms } from '../utils/sms'
import { EndReasonBadge } from './Badges'
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`w-full text-left px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition cursor-pointer ${active ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-surface-muted dark:hover:bg-slate-800'}`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-pastel-lavender text-pastel-lavDeep dark:bg-indigo-500/20 dark:text-indigo-300 flex items-center justify-center font-semibold text-sm">
          {name?.charAt(0)?.toUpperCase() || '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-strong dark:text-slate-100 text-sm truncate">{name}</span>
            {booked && <span className="badge badge-green">Booked</span>}
            {waiting && <span className="badge badge-yellow">Waiting</span>}
            <ResolutionPill resolution={resolution} />
          </div>
          {/* Phone gets bumped to text-sm on mobile so it's tappable-readable
              under the name; desktop stays compact at text-xs. */}
          <p className="text-sm sm:text-xs text-ink-muted dark:text-slate-400 mt-0.5 truncate font-medium sm:font-normal tabular-nums">
            {phoneShown && !phoneIsName ? fmtPhone(phoneShown) : fmtDate(call.createdAt)}
            {differ && (
              <span className="ml-1.5 text-ink-faint dark:text-slate-500 font-normal">· from {fmtPhone(callerId)}</span>
            )}
          </p>

          <div className="mt-2 flex items-center gap-2 sm:hidden">
            <EndReasonBadge reason={call.endedReason} />
            <span className="text-[11px] text-ink-muted dark:text-slate-400">
              {duration !== null ? fmtDuration(duration) : '—'} · {fmtDate(call.createdAt)}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <p className="text-xs text-ink-muted dark:text-slate-400 w-32 text-right">{fmtDate(call.createdAt)}</p>
          <div className="w-28 flex justify-start"><EndReasonBadge reason={call.endedReason} /></div>
          <p className="text-xs text-ink-muted dark:text-slate-400 tabular-nums w-14 text-center">
            {duration !== null ? fmtDuration(duration) : '—'}
          </p>
        </div>

        <SmsButton phone={phoneShown} body={smsBody} size="sm" label={`Text ${name}`} />
      </div>
    </div>
  )
}
