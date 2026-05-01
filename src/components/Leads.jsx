import { useEffect, useState, useMemo } from 'react'
import { fetchLeads, deleteLead, createLead, LEAD_STATUSES } from '../utils/leads'
import { supabase } from '../lib/supabase'
import { getSession } from '../utils/auth'
import { fmtPhone } from '../utils/phone'
import { Modal } from './AppointmentModal'
import { Icons } from './Icons'
import LeadResolutionForm from './LeadResolutionForm'
import ResolutionToggleButton from './ResolutionToggleButton'

function fmtRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function statusBadge(status) {
  const meta = LEAD_STATUSES[status]
  if (!meta) return null
  return <span className={`badge badge-${meta.tone}`}>{meta.short}</span>
}

function LeadRow({ lead, active, onClick }) {
  const initial = (lead.name || lead.email || '?').charAt(0).toUpperCase()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={`w-full text-left px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition cursor-pointer ${active ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-surface-muted dark:hover:bg-slate-800'}`}
    >
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-pastel-mint text-pastel-mintDeep dark:bg-emerald-500/20 dark:text-emerald-300 flex items-center justify-center font-semibold text-sm">
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-strong dark:text-slate-100 text-sm truncate">
              {lead.name || lead.email || lead.phone || 'New lead'}
            </span>
            {statusBadge(lead.status)}
          </div>
          <p className="text-xs text-ink-muted dark:text-slate-400 mt-0.5 truncate">
            {[lead.email, fmtPhone(lead.phone)].filter(Boolean).join(' · ')}
          </p>
          {lead.details && (
            <p className="text-xs text-ink-muted dark:text-slate-400 mt-0.5 truncate">
              {lead.details}
            </p>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <p className="text-xs text-ink-muted dark:text-slate-400 w-32 text-right">{fmtRelative(lead.created_at)}</p>
          <span className="text-ink-faint dark:text-slate-600"><Icons.ChevronRight /></span>
        </div>
      </div>
    </div>
  )
}

function LeadDetail({ lead, appointment, onClose, onChanged, onDeleted }) {
  const [resolutionOpen, setResolutionOpen] = useState(false)
  const initial = (lead.name || lead.email || '?').charAt(0).toUpperCase()

  async function handleDelete() {
    if (!confirm('Delete this lead?')) return
    try {
      await deleteLead(lead.id)
      onDeleted?.()
    } catch (e) {
      alert(e.message || 'Delete failed')
    }
  }

  async function handleSpam() {
    if (!confirm('Mark this lead as spam? It will be removed from your CRM.')) return
    try {
      await deleteLead(lead.id)
      onDeleted?.()
    } catch (e) {
      alert(e.message || 'Failed to remove lead')
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/60 backdrop-blur-sm" />
      <aside className="slide-in fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-surface-card dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 overflow-y-auto flex flex-col shadow-pop">
        <header className="sticky top-0 z-10 bg-surface-card/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-pastel-mint text-pastel-mintDeep dark:bg-emerald-500/20 dark:text-emerald-300 flex items-center justify-center font-bold">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted dark:text-slate-400">Lead · {fmtRelative(lead.created_at)}</p>
              <h2 className="text-lg font-bold text-ink-strong dark:text-slate-100 truncate">
                {lead.name || lead.email || lead.phone || 'New lead'}
              </h2>
              {statusBadge(lead.status)}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2"><Icons.X /></button>
        </header>

        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Contact */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">Contact</p>
            <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 space-y-1.5 text-sm break-words">
              {lead.name  && <div><span className="text-ink-muted dark:text-slate-400 mr-2">Name</span><span className="text-ink-strong dark:text-slate-100">{lead.name}</span></div>}
              {lead.email && <div><span className="text-ink-muted dark:text-slate-400 mr-2">Email</span><a href={`mailto:${lead.email}`} className="text-brand-600 dark:text-brand-400 hover:underline break-all">{lead.email}</a></div>}
              {lead.phone && <div><span className="text-ink-muted dark:text-slate-400 mr-2">Phone</span><a href={`tel:${lead.phone}`} className="text-brand-600 dark:text-brand-400 hover:underline">{fmtPhone(lead.phone)}</a></div>}
              {lead.source && <div><span className="text-ink-muted dark:text-slate-400 mr-2">Source</span><span className="text-ink-strong dark:text-slate-100 capitalize">{lead.source}</span></div>}
            </div>
          </div>

          {/* Details */}
          {lead.details && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-2">Details</p>
              <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3">
                <p className="text-sm text-ink-strong dark:text-slate-200 whitespace-pre-wrap break-words">{lead.details}</p>
              </div>
            </div>
          )}

          {/* Resolution toolbar — Mark Resolved + Spam on one row. */}
          <div className="flex items-stretch gap-2">
            <ResolutionToggleButton
              outcome={lead.status}
              expanded={resolutionOpen}
              onToggle={() => setResolutionOpen(o => !o)}
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleSpam}
              className="inline-flex items-center gap-1 rounded-xl bg-pastel-peach hover:bg-orange-200 text-pastel-peachDeep dark:bg-orange-500/15 dark:hover:bg-orange-500/25 dark:text-orange-300 font-semibold px-3 text-xs uppercase tracking-wide shrink-0"
              title="Mark this lead as spam and remove it"
            >
              <Icons.AlertTriangle /> Spam
            </button>
          </div>

          <LeadResolutionForm
            lead={lead}
            appointment={appointment}
            onSaved={onChanged}
            expanded={resolutionOpen}
            onToggle={setResolutionOpen}
          />

          {/* Danger zone */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={handleDelete} className="text-xs text-pastel-coralDeep dark:text-red-300 hover:underline">
              Delete this lead
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function NewLeadModal({ onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', details: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name && !form.email && !form.phone) {
      setError('Provide at least a name, email, or phone.')
      return
    }
    setSaving(true); setError('')
    try {
      await createLead(form)
      onSaved?.()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="New Lead" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-ink-muted dark:text-slate-400">Name</label>
          <input value={form.name} onChange={set('name')} placeholder="Full name" className="mt-1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted dark:text-slate-400">Email</label>
            <input type="email" value={form.email} onChange={set('email')} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-ink-muted dark:text-slate-400">Phone</label>
            <input type="tel" value={form.phone} onChange={set('phone')} className="mt-1" />
          </div>
        </div>
        <div>
          <label className="text-xs text-ink-muted dark:text-slate-400">Details</label>
          <textarea rows={3} value={form.details} onChange={set('details')} placeholder="What do they need?" className="mt-1" />
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Add lead'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [appointments, setAppointments] = useState({}) // id → appointment row
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)

  async function reload() {
    setLoading(true); setError('')
    try {
      const list = await fetchLeads()
      setLeads(list)
      // Side-load any linked appointments so the detail panel can show the
      // booked slot without a second click.
      const ids = list.map(l => l.appointment_id).filter(Boolean)
      if (ids.length) {
        const s = await getSession()
        const { data } = await supabase
          .from('appointments')
          .select('id, date, time_start, time_end, service_type, customer_address, problem, status')
          .in('id', ids)
          .eq('user_id', s.user.id)
        const map = {}
        for (const a of data || []) map[a.id] = a
        setAppointments(map)
      } else {
        setAppointments({})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => {
    let pool = leads
    if (filter !== 'all') pool = pool.filter(l => l.status === filter)
    const q = search.trim().toLowerCase()
    if (!q) return pool
    return pool.filter(l =>
      (l.name || '').toLowerCase().includes(q)
      || (l.email || '').toLowerCase().includes(q)
      || (l.phone || '').includes(q)
      || (l.details || '').toLowerCase().includes(q),
    )
  }, [leads, filter, search])

  const counts = useMemo(() => ({
    all:     leads.length,
    waiting: leads.filter(l => l.status === 'waiting').length,
    booked:  leads.filter(l => l.status === 'booked').length,
    done:    leads.filter(l => l.status === 'done').length,
  }), [leads])

  const selectedAppt = selected?.appointment_id ? appointments[selected.appointment_id] : null

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {[
            { key: 'all',     label: 'All',     count: counts.all },
            { key: 'waiting', label: 'Waiting', count: counts.waiting },
            { key: 'booked',  label: 'Booked',  count: counts.booked },
            { key: 'done',    label: 'Done',    count: counts.done },
          ].map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-surface-muted text-ink-muted hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                {f.label}
                <span className={`tabular-nums ${active ? 'opacity-90' : 'opacity-70'}`}>· {f.count}</span>
              </button>
            )
          })}
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">+ New Lead</button>
      </div>

      <div className="relative mb-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500"><Icons.Search /></span>
        <input
          placeholder="Search by name, email, phone, or details…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-11"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-ink-muted dark:text-slate-400">
            <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
            <p>Loading leads…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pastel-mint dark:bg-emerald-500/20 flex items-center justify-center text-pastel-mintDeep dark:text-emerald-300">
              <Icons.User />
            </div>
            <p className="text-ink-strong dark:text-slate-100 font-medium">
              {search ? 'No leads match your search.'
                : filter === 'waiting' ? 'No leads waiting on Mike.'
                : filter === 'booked'  ? 'No booked leads.'
                : filter === 'done'    ? 'No completed leads yet.'
                : 'No leads yet.'}
            </p>
            {!search && filter === 'all' && (
              <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">Wire your contact form to the intake webhook (Settings → Lead intake) and submissions will appear here.</p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                active={selected?.id === lead.id}
                onClick={() => setSelected(selected?.id === lead.id ? null : lead)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <LeadDetail
          lead={leads.find(l => l.id === selected.id) || selected}
          appointment={selectedAppt}
          onClose={() => setSelected(null)}
          onChanged={reload}
          onDeleted={() => { setSelected(null); reload() }}
        />
      )}

      {showNew && (
        <NewLeadModal
          onSaved={() => { setShowNew(false); reload() }}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  )
}
