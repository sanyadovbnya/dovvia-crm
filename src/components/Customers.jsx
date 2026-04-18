import { useEffect, useState, useMemo } from 'react'
import { fetchAllAppointments, groupIntoCustomers, topServices, fmtPhone } from '../utils/customers'
import { Icons } from './Icons'

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

const STATUS_TONE = {
  scheduled:   'bg-pastel-sky      text-pastel-skyDeep   dark:bg-blue-500/20     dark:text-blue-300',
  completed:   'bg-pastel-mint     text-pastel-mintDeep  dark:bg-emerald-500/20  dark:text-emerald-300',
  cancelled:   'bg-pastel-coral    text-pastel-coralDeep dark:bg-red-500/20      dark:text-red-300',
  rescheduled: 'bg-pastel-peach    text-pastel-peachDeep dark:bg-orange-500/20   dark:text-orange-300',
}

function AvatarTile({ name, size = 'md' }) {
  const initial = (name || '?').charAt(0).toUpperCase()
  const dims = size === 'lg' ? 'h-12 w-12 text-lg' : 'h-10 w-10 text-sm'
  return (
    <div className={`${dims} shrink-0 rounded-xl bg-pastel-lavender text-pastel-lavDeep dark:bg-indigo-500/20 dark:text-indigo-300 flex items-center justify-center font-bold`}>
      {initial}
    </div>
  )
}

function CustomerRow({ customer, onClick, active }) {
  const services = topServices(customer, 2)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition ${active ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-surface-muted dark:hover:bg-slate-800'}`}
    >
      <div className="flex items-center gap-4">
        <AvatarTile name={customer.name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-strong dark:text-slate-100 text-sm truncate">{customer.name}</span>
            {customer.upcoming > 0 && (
              <span className="badge badge-green">Upcoming</span>
            )}
          </div>
          <p className="text-xs text-ink-muted dark:text-slate-400 mt-0.5 truncate">
            {fmtPhone(customer.phone || customer.callerPhone)}
            {customer.callerPhone && customer.phone && fmtPhone(customer.callerPhone) !== fmtPhone(customer.phone) && (
              <span className="ml-1.5 text-ink-faint dark:text-slate-500">· from {fmtPhone(customer.callerPhone)}</span>
            )}
            {services.length > 0 && ` · ${services.join(', ')}`}
          </p>

          <div className="mt-2 flex items-center gap-2 sm:hidden text-[11px] text-ink-muted dark:text-slate-400">
            <span>{customer.total} {customer.total === 1 ? 'job' : 'jobs'}</span>
            <span>·</span>
            <span>Last: {fmtDate(customer.lastDate)}</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs tabular-nums">
          <div className="w-16 text-right">
            <p className="font-semibold text-ink-strong dark:text-slate-100">{customer.total}</p>
            <p className="text-ink-muted dark:text-slate-400 text-[10px] uppercase tracking-wider">jobs</p>
          </div>
          <div className="w-24 text-right text-ink-muted dark:text-slate-400">
            {fmtDate(customer.lastDate)}
          </div>
          <span className="text-ink-faint dark:text-slate-600"><Icons.ChevronRight /></span>
        </div>
      </div>
    </button>
  )
}

function CustomerDetail({ customer, onClose }) {
  const upcoming = customer.appointments.filter(a => {
    const today = new Date().toISOString().slice(0, 10)
    return a.date >= today && a.status !== 'cancelled'
  })
  const past = customer.appointments.filter(a => {
    const today = new Date().toISOString().slice(0, 10)
    return a.date < today || a.status === 'cancelled'
  })

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/60 backdrop-blur-sm" />
      <aside className="slide-in fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-surface-card dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 overflow-y-auto flex flex-col shadow-pop">
        <header className="sticky top-0 z-10 bg-surface-card/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AvatarTile name={customer.name} size="lg" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink-strong dark:text-slate-100 truncate">{customer.name}</h2>
              <p className="text-sm text-ink-muted dark:text-slate-400 truncate">{fmtPhone(customer.phone || customer.callerPhone)}</p>
              {customer.callerPhone && customer.phone && fmtPhone(customer.callerPhone) !== fmtPhone(customer.phone) && (
                <p className="text-xs text-ink-muted dark:text-slate-400 truncate">Called from {fmtPhone(customer.callerPhone)}</p>
              )}
              {customer.address && (
                <p className="text-xs text-ink-muted dark:text-slate-400 truncate mt-0.5">{customer.address}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2"><Icons.X /></button>
        </header>

        <div className="px-5 py-5 space-y-5">
          {/* Stat tiles */}
          <div className="grid grid-cols-4 gap-2">
            <StatTile value={customer.total} label="Total" tone="lavender" />
            <StatTile value={customer.upcoming} label="Upcoming" tone="mint" />
            <StatTile value={customer.completed} label="Done" tone="sky" />
            <StatTile value={customer.cancelled} label="Cancelled" tone="coral" />
          </div>

          {/* Services */}
          {Object.keys(customer.services).length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">Services used</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(customer.services).sort((a, b) => b[1] - a[1]).map(([svc, n]) => (
                  <span key={svc} className="badge badge-gray">{svc} · {n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <ApptList title="Upcoming" appts={upcoming} />
          )}

          {/* History */}
          {past.length > 0 && (
            <ApptList title="History" appts={past} />
          )}
        </div>
      </aside>
    </>
  )
}

function StatTile({ value, label, tone }) {
  const TONES = {
    lavender: 'bg-pastel-lavender text-pastel-lavDeep   dark:bg-indigo-500/15  dark:text-indigo-300',
    mint:     'bg-pastel-mint     text-pastel-mintDeep  dark:bg-emerald-500/15 dark:text-emerald-300',
    sky:      'bg-pastel-sky      text-pastel-skyDeep   dark:bg-blue-500/15    dark:text-blue-300',
    coral:    'bg-pastel-coral    text-pastel-coralDeep dark:bg-red-500/15     dark:text-red-300',
  }
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${TONES[tone] || TONES.lavender}`}>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wider mt-1 opacity-80">{label}</p>
    </div>
  )
}

function ApptList({ title, appts }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">{title}</p>
      <div className="space-y-2">
        {appts.map(a => (
          <div key={a.id} className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-strong dark:text-slate-100">
                {fmtDate(a.date)} · {fmtTime(a.time_start)}
              </p>
              <span className={`badge ${STATUS_TONE[a.status] || STATUS_TONE.scheduled}`}>{a.status}</span>
            </div>
            {a.service_type && (
              <p className="text-xs text-ink-muted dark:text-slate-400 mt-1">{a.service_type}</p>
            )}
            {a.problem && (
              <p className="text-xs text-ink-muted dark:text-slate-400 mt-1">{a.problem}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Customers() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let active = true
    fetchAllAppointments()
      .then(a => { if (active) setAppointments(a) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const customers = useMemo(() => groupIntoCustomers(appointments), [appointments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c => {
      return (c.name || '').toLowerCase().includes(q)
        || (c.phone || '').includes(q)
        || (c.address || '').toLowerCase().includes(q)
        || Object.keys(c.services || {}).some(s => s.toLowerCase().includes(q))
    })
  }, [customers, search])

  return (
    <div>
      <div className="relative mb-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500"><Icons.Search /></span>
        <input
          placeholder="Search by name, phone, address, service…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-11"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_64px_96px_20px] items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-surface-muted/40 dark:bg-slate-800/40">
          {['Customer', 'Jobs', 'Last seen', ''].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 text-right first:text-left">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-ink-muted dark:text-slate-400">
            <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
            <p>Loading customers…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pastel-lavender dark:bg-indigo-500/20 flex items-center justify-center text-pastel-lavDeep dark:text-indigo-300">
              <Icons.User />
            </div>
            <p className="text-ink-strong dark:text-slate-100 font-medium">
              {search ? 'No customers match your search.' : 'No customers yet.'}
            </p>
            {!search && (
              <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">Bookings from Max will build up your customer list automatically.</p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map(c => (
              <CustomerRow
                key={c.key}
                customer={c}
                active={selected?.key === c.key}
                onClick={() => setSelected(selected?.key === c.key ? null : c)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
