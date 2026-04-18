import { useMemo } from 'react'
import { callDuration, isBooked, callOutputs, fmtDuration } from '../utils/formatters'
import { Icons } from './Icons'

function startOfDay(d) { const n = new Date(d); n.setHours(0, 0, 0, 0); return n }

function computeStats(calls) {
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const days = 14

  const volumeByDay = Array.from({ length: days }, (_, i) => {
    const d = startOfDay(new Date(now.getTime() - (days - 1 - i) * dayMs))
    return { date: d, total: 0, booked: 0 }
  })
  const dayIndex = new Map(volumeByDay.map((v, i) => [v.date.getTime(), i]))

  let totalDuration = 0
  let durationCount = 0
  const services = new Map()
  const hourDist = Array(24).fill(0)
  const endReasons = new Map()
  let bookedTotal = 0
  let totalRecent = 0

  for (const c of calls || []) {
    const created = c.createdAt ? new Date(c.createdAt) : null
    if (!created || isNaN(created)) continue

    const dayStart = startOfDay(created).getTime()
    const bucket = dayIndex.get(dayStart)
    if (bucket !== undefined) {
      volumeByDay[bucket].total += 1
      totalRecent += 1
      if (isBooked(c)) {
        volumeByDay[bucket].booked += 1
        bookedTotal += 1
      }
    }

    const dur = callDuration(c)
    if (dur !== null) { totalDuration += dur; durationCount += 1 }

    const o = callOutputs(c)
    const svc = (o.serviceType || '').trim() || 'Unspecified'
    services.set(svc, (services.get(svc) || 0) + 1)

    hourDist[created.getHours()] += 1

    const r = (c.endedReason || 'unknown').replace(/-/g, ' ')
    endReasons.set(r, (endReasons.get(r) || 0) + 1)
  }

  const avgDuration = durationCount ? totalDuration / durationCount : 0
  const conversionRate = totalRecent ? Math.round((bookedTotal / totalRecent) * 100) : 0
  const topServices = [...services.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const peakHour = hourDist.reduce((best, v, h) => v > best.v ? { h, v } : best, { h: 0, v: 0 })

  return {
    volumeByDay,
    avgDuration,
    conversionRate,
    totalRecent,
    bookedTotal,
    topServices,
    peakHour,
    endReasons: [...endReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  }
}

function BarSparkline({ data, maxKey = 'total' }) {
  const max = Math.max(1, ...data.map(d => d[maxKey]))
  return (
    <div className="flex items-end gap-1 h-28">
      {data.map((d, i) => {
        const totalH = (d.total / max) * 100
        const bookedH = (d.booked / max) * 100
        const isToday = i === data.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="w-full flex-1 flex items-end">
              <div className="w-full relative rounded-t-md bg-brand-100 dark:bg-brand-500/25" style={{ height: `${totalH}%` }}>
                <div className="absolute inset-x-0 bottom-0 rounded-t-md bg-brand-500 dark:bg-brand-400" style={{ height: `${(bookedH / Math.max(totalH, 1)) * 100}%` }} />
              </div>
            </div>
            <span className={`text-[9px] ${isToday ? 'font-bold text-brand-600 dark:text-brand-400' : 'text-ink-faint dark:text-slate-500'}`}>
              {d.date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}
            </span>
            <div className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-medium px-2 py-1 opacity-0 group-hover:opacity-100 transition shadow-card">
              {d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {d.booked}/{d.total}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Donut({ percent, label }) {
  const r = 36
  const c = 2 * Math.PI * r
  const off = c - (c * percent) / 100
  return (
    <div className="relative h-[120px] w-[120px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} className="fill-none stroke-surface-muted dark:stroke-slate-800" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} className="fill-none stroke-brand-500 transition-all duration-500" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-ink-strong dark:text-slate-100 leading-none">{percent}%</p>
        {label && <p className="text-[10px] uppercase tracking-wider text-ink-muted dark:text-slate-400 mt-1">{label}</p>}
      </div>
    </div>
  )
}

function HorizontalBars({ rows, accent = 'bg-brand-500' }) {
  const max = Math.max(1, ...rows.map(r => r[1]))
  return (
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-ink-base dark:text-slate-300 truncate">{label}</span>
            <span className="text-ink-muted dark:text-slate-400 tabular-nums">{value}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full ${accent} transition-all duration-500`} style={{ width: `${(value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Stats({ calls, loading }) {
  const s = useMemo(() => computeStats(calls || []), [calls])

  if (loading && (!calls || calls.length === 0)) {
    return (
      <div className="card p-16 text-center text-ink-muted dark:text-slate-400">
        <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
        <p>Loading stats…</p>
      </div>
    )
  }

  if (!calls || calls.length === 0) {
    return (
      <div className="card p-16 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pastel-lavender dark:bg-indigo-500/20 flex items-center justify-center text-pastel-lavDeep dark:text-indigo-300">
          <Icons.BarChart />
        </div>
        <p className="text-ink-strong dark:text-slate-100 font-medium">No stats yet.</p>
        <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">Once customers start calling, trends show up here.</p>
      </div>
    )
  }

  const peakHr = s.peakHour.h
  const peakLabel = `${peakHr % 12 || 12}${peakHr < 12 ? 'a' : 'p'}`

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Booking conversion donut */}
      <div className="card p-5 lg:col-span-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Booking Conversion</p>
        <div className="mt-4 flex items-center gap-6">
          <Donut percent={s.conversionRate} label="booked" />
          <div className="flex-1 min-w-0 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted dark:text-slate-400">Calls (14d)</span>
              <span className="font-semibold text-ink-strong dark:text-slate-100 tabular-nums">{s.totalRecent}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted dark:text-slate-400">Booked</span>
              <span className="font-semibold text-ink-strong dark:text-slate-100 tabular-nums">{s.bookedTotal}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted dark:text-slate-400">Avg duration</span>
              <span className="font-semibold text-ink-strong dark:text-slate-100 tabular-nums">{fmtDuration(s.avgDuration)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted dark:text-slate-400">Peak hour</span>
              <span className="font-semibold text-ink-strong dark:text-slate-100">{peakLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Call volume sparkline */}
      <div className="card p-5 lg:col-span-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Call Volume (last 14 days)</p>
            <p className="mt-1 text-3xl font-bold text-ink-strong dark:text-slate-100 leading-none">{s.totalRecent}</p>
            <p className="mt-2 text-xs text-ink-muted dark:text-slate-400">Darker bars = booked appointments</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-muted dark:text-slate-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" /> Booked
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-100 dark:bg-brand-500/25 ml-2" /> Total
          </div>
        </div>
        <div className="mt-4">
          <BarSparkline data={s.volumeByDay} />
        </div>
      </div>

      {/* Top services */}
      <div className="card p-5 lg:col-span-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Top Services</p>
        <div className="mt-4">
          {s.topServices.length === 0 ? (
            <p className="text-sm text-ink-faint dark:text-slate-500 py-6 text-center">No service data yet.</p>
          ) : (
            <HorizontalBars rows={s.topServices} />
          )}
        </div>
      </div>

      {/* Call outcomes */}
      <div className="card p-5 lg:col-span-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Call Outcomes</p>
        <div className="mt-4">
          {s.endReasons.length === 0 ? (
            <p className="text-sm text-ink-faint dark:text-slate-500 py-6 text-center">No outcomes yet.</p>
          ) : (
            <HorizontalBars
              rows={s.endReasons.map(([k, v]) => [k, v])}
              accent="bg-pastel-lavDeep/80 dark:bg-indigo-400"
            />
          )}
        </div>
      </div>
    </div>
  )
}
