import { useEffect, useState, useMemo } from 'react'
import {
  fetchInvoices, createInvoice, updateInvoice, markSent, markPaid, deleteInvoice,
  fmtUSD, recompute, buildMailto, aiParseInvoice,
} from '../utils/invoices'
import { loadProfile } from '../utils/profile'
import { Modal } from './AppointmentModal'
import { Icons } from './Icons'
import InvoicePrintView from './InvoicePrintView'

const STATUS_TONE = {
  draft: 'bg-slate-100       text-ink-muted        dark:bg-slate-800       dark:text-slate-400',
  sent:  'bg-pastel-sky      text-pastel-skyDeep   dark:bg-blue-500/20     dark:text-blue-300',
  paid:  'bg-pastel-mint     text-pastel-mintDeep  dark:bg-emerald-500/20  dark:text-emerald-300',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-ink-strong dark:text-slate-200 mb-1.5">
      {children}{required && <span className="text-brand-500"> *</span>}
    </label>
  )
}

function InvoiceForm({ initial, profile, onSave, onClose, saving }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    customer_name:    initial?.customer_name || '',
    customer_email:   initial?.customer_email || '',
    customer_phone:   initial?.customer_phone || '',
    customer_address: initial?.customer_address || '',
    serviced_unit:    initial?.serviced_unit || '',
    service_date:     initial?.service_date || today,
    line_items:       initial?.line_items?.length ? initial.line_items : [{ description: '', amount: '' }],
    tax_rate:         (initial?.tax_rate ?? profile?.invoice_default_tax_rate ?? 0).toString(),
    notes:            initial?.notes || '',
  })

  // ── AI Assist state ────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')

  async function handleAiFill() {
    if (!aiText.trim()) { setAiErr('Type or paste some notes first.'); return }
    setAiBusy(true); setAiErr('')
    try {
      const draft = await aiParseInvoice(aiText)
      setForm(f => ({
        customer_name:    draft.customer_name    || f.customer_name,
        customer_email:   draft.customer_email   || f.customer_email,
        customer_phone:   draft.customer_phone   || f.customer_phone,
        customer_address: draft.customer_address || f.customer_address,
        serviced_unit:    draft.serviced_unit    || f.serviced_unit,
        service_date:     draft.service_date     || f.service_date,
        line_items: draft.line_items?.length
          ? draft.line_items.map(l => ({ description: l.description, amount: String(l.amount ?? '') }))
          : f.line_items,
        tax_rate: draft.tax_rate != null
          ? String(draft.tax_rate)
          : f.tax_rate,
        notes: draft.notes || f.notes,
      }))
      setAiOpen(false)
      setAiText('')
    } catch (e) {
      setAiErr(e.message)
    } finally {
      setAiBusy(false)
    }
  }

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))
  function setLine(i, field, value) {
    setForm(f => ({
      ...f,
      line_items: f.line_items.map((l, idx) => idx === i ? { ...l, [field]: value } : l),
    }))
  }
  function addLine() {
    setForm(f => ({ ...f, line_items: [...f.line_items, { description: '', amount: '' }] }))
  }
  function removeLine(i) {
    setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) || [{ description: '', amount: '' }] }))
  }

  const totals = useMemo(
    () => recompute(
      form.line_items.map(l => ({ ...l, amount: Number(l.amount) || 0 })),
      Number(form.tax_rate) || 0,
    ),
    [form.line_items, form.tax_rate],
  )

  function handleSubmit(e) {
    e.preventDefault()
    const cleanedItems = form.line_items
      .filter(l => l.description?.trim() || Number(l.amount))
      .map(l => ({ description: l.description.trim(), amount: Number(l.amount) || 0 }))
    onSave({
      ...form,
      line_items: cleanedItems,
      tax_rate: Number(form.tax_rate) || 0,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* AI Assist */}
      <div className="rounded-xl2 border border-dashed border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5 px-4 py-3">
        {!aiOpen ? (
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="w-full text-left flex items-center justify-between gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300"
          >
            <span>✨ AI Assist — paste notes in any language, we&apos;ll fill the form</span>
            <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Try it</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">✨ Paste notes (English or Russian)</p>
              <button type="button" onClick={() => { setAiOpen(false); setAiText(''); setAiErr('') }} className="text-ink-muted hover:text-ink-strong dark:text-slate-400 dark:hover:text-slate-200">
                <Icons.X />
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="e.g. Крис Майерс, ремонт пеллетной печи, плата управления 400, работа 380, налог 9%, 04/24/2026"
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              className="resize-y"
            />
            {aiErr && (
              <p className="text-xs rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">{aiErr}</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={handleAiFill} disabled={aiBusy} className="btn-primary flex-1">
                {aiBusy ? 'Thinking…' : 'Fill form from notes'}
              </button>
            </div>
            <p className="text-[11px] text-ink-faint dark:text-slate-500">
              We translate Russian to English and pre-fill the form below. Review before saving.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Customer name</Label>
          <input required value={form.customer_name} onChange={set('customer_name')} />
        </div>
        <div>
          <Label>Customer email</Label>
          <input type="email" value={form.customer_email} onChange={set('customer_email')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Phone</Label>
          <input type="tel" value={form.customer_phone} onChange={set('customer_phone')} />
        </div>
        <div>
          <Label>Address</Label>
          <input value={form.customer_address} onChange={set('customer_address')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Serviced unit</Label>
          <input placeholder="Pellet Stove, Dishwasher, etc." value={form.serviced_unit} onChange={set('serviced_unit')} />
        </div>
        <div>
          <Label required>Service date</Label>
          <input required type="date" value={form.service_date} onChange={set('service_date')} />
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-ink-strong dark:text-slate-200">Line items</p>
          <button type="button" onClick={addLine} className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">+ Add line</button>
        </div>
        <div className="space-y-2">
          {form.line_items.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
              <input
                placeholder="Description (e.g. Control Board)"
                value={l.description}
                onChange={e => setLine(i, 'description', e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={l.amount}
                onChange={e => setLine(i, 'amount', e.target.value)}
                className="text-right"
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                className="h-10 w-9 rounded-lg bg-surface-muted hover:bg-pastel-coral hover:text-pastel-coralDeep text-ink-muted dark:bg-slate-800 dark:hover:bg-red-500/20 dark:hover:text-red-300 transition flex items-center justify-center"
                title="Remove"
              >
                <Icons.X />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tax rate (%)</Label>
          <input type="number" step="0.01" value={form.tax_rate} onChange={set('tax_rate')} />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <input placeholder="Optional note shown on invoice" value={form.notes} onChange={set('notes')} />
        </div>
      </div>

      {/* Live totals */}
      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted dark:text-slate-400">Subtotal</span>
          <span className="text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(totals.subtotal)}</span>
        </div>
        {Number(form.tax_rate) > 0 && (
          <div className="flex justify-between mt-1">
            <span className="text-ink-muted dark:text-slate-400">Sales Tax ({form.tax_rate}%)</span>
            <span className="text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(totals.tax_amount)}</span>
          </div>
        )}
        <div className="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2 flex justify-between font-bold">
          <span className="text-ink-strong dark:text-slate-100">Total</span>
          <span className="text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(totals.total)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? 'Saving…' : (initial ? 'Save changes' : 'Create invoice')}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </form>
  )
}

function InvoiceDetail({ invoice, profile, onClose, onEdit, onPrint, onMarkSent, onMarkPaid, onDelete, onEmail, busy }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">Invoice #{invoice.invoice_number}</p>
          <h3 className="text-lg font-bold text-ink-strong dark:text-slate-100 mt-0.5">{invoice.customer_name}</h3>
          <p className="text-sm text-ink-muted dark:text-slate-400">{invoice.serviced_unit || 'Service'} · {fmtDate(invoice.service_date)}</p>
        </div>
        <span className={`badge ${STATUS_TONE[invoice.status] || STATUS_TONE.draft}`}>{invoice.status}</span>
      </div>

      <div className="rounded-xl2 bg-surface-muted dark:bg-slate-800/60 px-4 py-3 mb-4 text-sm space-y-1">
        {invoice.customer_email   && <div><span className="text-ink-muted dark:text-slate-400">Email:</span> <span className="text-ink-strong dark:text-slate-100">{invoice.customer_email}</span></div>}
        {invoice.customer_phone   && <div><span className="text-ink-muted dark:text-slate-400">Phone:</span> <span className="text-ink-strong dark:text-slate-100">{invoice.customer_phone}</span></div>}
        {invoice.customer_address && <div><span className="text-ink-muted dark:text-slate-400">Address:</span> <span className="text-ink-strong dark:text-slate-100">{invoice.customer_address}</span></div>}
      </div>

      <div className="rounded-xl2 border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted dark:bg-slate-800/60">
            <tr>
              <th className="text-left font-semibold px-3 py-2 text-ink-muted dark:text-slate-400">Description</th>
              <th className="text-right font-semibold px-3 py-2 text-ink-muted dark:text-slate-400 w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((l, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 text-ink-strong dark:text-slate-100">{l.description}</td>
                <td className="px-3 py-2 text-right text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="px-3 py-2 text-ink-muted dark:text-slate-400">Subtotal</td>
              <td className="px-3 py-2 text-right text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(invoice.subtotal)}</td>
            </tr>
            {Number(invoice.tax_rate) > 0 && (
              <tr>
                <td className="px-3 py-2 text-ink-muted dark:text-slate-400">Sales Tax ({invoice.tax_rate}%)</td>
                <td className="px-3 py-2 text-right text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(invoice.tax_amount)}</td>
              </tr>
            )}
            <tr className="bg-surface-muted dark:bg-slate-800/60 font-bold">
              <td className="px-3 py-2 text-ink-strong dark:text-slate-100">Total</td>
              <td className="px-3 py-2 text-right text-ink-strong dark:text-slate-100 tabular-nums">{fmtUSD(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button onClick={onPrint} className="btn-ghost"><Icons.Calendar /> Print / PDF</button>
        <button onClick={onEmail} className="btn-ghost" disabled={!invoice.customer_email} title={invoice.customer_email ? 'Open mail client' : 'Add a customer email to enable'}>
          <Icons.User /> Email customer
        </button>
        <button onClick={onEdit} className="btn-ghost"><Icons.Settings /> Edit</button>
        <button onClick={onDelete} className="btn-ghost hover:text-pastel-coralDeep dark:hover:text-red-300">Delete</button>
      </div>

      <div className="flex gap-2 mt-4">
        {invoice.status === 'draft' && (
          <button disabled={busy} onClick={onMarkSent} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-pastel-sky text-pastel-skyDeep hover:bg-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25 transition">
            Mark as sent
          </button>
        )}
        {invoice.status !== 'paid' && (
          <button disabled={busy} onClick={onMarkPaid} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-pastel-mint text-pastel-mintDeep hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 transition">
            Mark as paid
          </button>
        )}
      </div>

      <button onClick={onClose} className="btn-ghost w-full mt-2">Close</button>
    </>
  )
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { type: 'new' | 'edit' | 'detail', invoice? }
  const [printing, setPrinting] = useState(null) // invoice
  const [saving, setSaving] = useState(false)

  async function reload() {
    try {
      const [list, prof] = await Promise.all([fetchInvoices(), loadProfile()])
      setInvoices(list)
      setProfile(prof)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  async function handleCreate(form) {
    setSaving(true); setError('')
    try {
      await createInvoice(form)
      await reload()
      setModal(null)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  async function handleUpdate(id, form) {
    setSaving(true); setError('')
    try {
      await updateInvoice(id, form)
      await reload()
      setModal(null)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  async function handleDelete(id) {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return
    try { await deleteInvoice(id); await reload(); setModal(null) }
    catch (e) { setError(e.message) }
  }

  function handleEmail(inv) {
    if (!inv.customer_email) { setError('Add a customer email to email this invoice.'); return }
    window.location.href = buildMailto(inv, profile)
    if (inv.status === 'draft') {
      markSent(inv.id).then(reload).catch(() => {})
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(i =>
      String(i.invoice_number).includes(q)
      || (i.customer_name || '').toLowerCase().includes(q)
      || (i.customer_email || '').toLowerCase().includes(q)
      || (i.serviced_unit || '').toLowerCase().includes(q),
    )
  }, [invoices, search])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-slate-500"><Icons.Search /></span>
          <input
            placeholder="Search by # / customer / unit…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-11"
          />
        </div>
        <button onClick={() => setModal({ type: 'new' })} className="btn-primary">+ New Invoice</button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><Icons.X /></button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="hidden sm:grid grid-cols-[80px_1fr_120px_120px_80px_20px] items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-surface-muted/40 dark:bg-slate-800/40">
          {['#', 'Customer', 'Service', 'Date', 'Total', ''].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-ink-muted dark:text-slate-400">
            <span className="spinner inline-block mb-3"><Icons.Spinner /></span>
            <p>Loading invoices…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pastel-peach dark:bg-orange-500/20 flex items-center justify-center text-pastel-peachDeep dark:text-orange-300">
              <Icons.Calendar />
            </div>
            <p className="text-ink-strong dark:text-slate-100 font-medium">{search ? 'No invoices match your search.' : 'No invoices yet.'}</p>
            {!search && <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">Create one after a job to bill the customer.</p>}
          </div>
        ) : filtered.map(inv => (
          <button
            key={inv.id}
            onClick={() => setModal({ type: 'detail', invoice: inv })}
            className="w-full text-left px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition hover:bg-surface-muted dark:hover:bg-slate-800"
          >
            <div className="flex sm:grid sm:grid-cols-[80px_1fr_120px_120px_80px_20px] items-center gap-3">
              <span className="hidden sm:inline text-sm font-semibold text-ink-strong dark:text-slate-100 tabular-nums">#{inv.invoice_number}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink-strong dark:text-slate-100 text-sm truncate">{inv.customer_name}</span>
                  <span className={`badge ${STATUS_TONE[inv.status] || STATUS_TONE.draft}`}>{inv.status}</span>
                  <span className="sm:hidden text-[11px] text-ink-muted dark:text-slate-400">#{inv.invoice_number}</span>
                </div>
                <p className="text-xs text-ink-muted dark:text-slate-400 mt-0.5 truncate">
                  {inv.serviced_unit || 'Service'} · {fmtDate(inv.service_date)} · <span className="tabular-nums">{fmtUSD(inv.total)}</span>
                </p>
              </div>

              <span className="hidden sm:inline text-xs text-ink-muted dark:text-slate-400 truncate">{inv.serviced_unit || '—'}</span>
              <span className="hidden sm:inline text-xs text-ink-muted dark:text-slate-400">{fmtDate(inv.service_date)}</span>
              <span className="hidden sm:inline text-sm font-semibold text-ink-strong dark:text-slate-100 tabular-nums text-right">{fmtUSD(inv.total)}</span>
              <span className="hidden sm:inline text-ink-faint dark:text-slate-600"><Icons.ChevronRight /></span>
            </div>
          </button>
        ))}
      </div>

      {modal?.type === 'new' && (
        <Modal title="New Invoice" onClose={() => setModal(null)}>
          <InvoiceForm
            profile={profile}
            onSave={handleCreate}
            onClose={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title={`Edit Invoice #${modal.invoice.invoice_number}`} onClose={() => setModal(null)}>
          <InvoiceForm
            initial={modal.invoice}
            profile={profile}
            onSave={form => handleUpdate(modal.invoice.id, form)}
            onClose={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
      {modal?.type === 'detail' && (
        <Modal onClose={() => setModal(null)}>
          <InvoiceDetail
            invoice={modal.invoice}
            profile={profile}
            onClose={() => setModal(null)}
            onEdit={() => setModal({ type: 'edit', invoice: modal.invoice })}
            onPrint={() => setPrinting(modal.invoice)}
            onEmail={() => handleEmail(modal.invoice)}
            onMarkSent={() => markSent(modal.invoice.id).then(reload)}
            onMarkPaid={() => markPaid(modal.invoice.id).then(reload)}
            onDelete={() => handleDelete(modal.invoice.id)}
          />
        </Modal>
      )}

      {printing && (
        <InvoicePrintView
          invoice={printing}
          profile={profile}
          onClose={() => setPrinting(null)}
        />
      )}
    </div>
  )
}
