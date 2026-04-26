import { useEffect } from 'react'
import { fmtUSD } from '../utils/invoices'

// A self-contained, white-background, print-friendly invoice rendered
// in a fullscreen overlay. Calls window.print() once mounted.
//
// We write all colors as inline styles so the global `dark:` overrides
// (e.g. h1 { dark:text-slate-100 }) can't bleed into this view when the
// rest of the app is in dark mode.
export default function InvoicePrintView({ invoice, profile, onClose }) {
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => window.print(), 100)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = orig
    }
  }, [])

  const dt = new Date(invoice.service_date + 'T00:00').toLocaleDateString('en-US')
  const ink = '#0f172a'      // slate-900
  const sub = '#475569'      // slate-600
  const line = '#e2e8f0'     // slate-200
  const headerBg = '#f1f5f9' // slate-100
  const totalBg  = '#f8fafc' // slate-50

  const td = { padding: '8px 12px', border: `1px solid ${line}`, color: ink }
  const tdRight = { ...td, textAlign: 'right' }

  return (
    <div
      className="fixed inset-0 z-[100] overflow-auto print:static"
      style={{ background: '#ffffff', color: ink, colorScheme: 'light' }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        /* Belt-and-suspenders: force every element inside the print
           view to inherit the slate-900 ink instead of dark-mode whites. */
        .invoice-print, .invoice-print * { color: ${ink} !important; }
        .invoice-print .muted { color: ${sub} !important; }
      `}</style>

      <div className="no-print sticky top-0 px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: `1px solid ${line}` }}>
        <p className="text-sm muted">Print-ready preview</p>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 text-sm" style={{ color: '#ffffff' }}>
            Print / Save as PDF
          </button>
          <button onClick={onClose} className="rounded-xl bg-slate-100 hover:bg-slate-200 font-medium px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>

      <div className="invoice-print max-w-3xl mx-auto px-10 py-12 font-sans">
        {profile?.business_logo_url && (
          <div className="text-center mb-3">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img
              src={profile.business_logo_url}
              alt=""
              onError={e => { e.currentTarget.style.display = 'none' }}
              style={{ maxHeight: 80, maxWidth: 240, margin: '0 auto', objectFit: 'contain' }}
            />
          </div>
        )}

        <h1 className="text-3xl font-bold text-center mb-1" style={{ color: ink }}>
          {profile?.shop_name || 'Your Shop'}
        </h1>
        <div className="text-center text-sm leading-relaxed mb-10" style={{ color: ink }}>
          {profile?.business_address && <div>{profile.business_address}</div>}
          <div>
            {profile?.business_email && <>Email: {profile.business_email}</>}
            {profile?.business_email && profile?.twilio_from_number && ' | '}
            {profile?.twilio_from_number && <>Phone: {profile.twilio_from_number}</>}
          </div>
          {profile?.business_website && <div>{profile.business_website}</div>}
        </div>

        <h2 className="text-xl font-bold mb-2" style={{ color: ink }}>INVOICE #{invoice.invoice_number}</h2>
        {invoice.serviced_unit && (
          <p className="text-sm mb-6" style={{ color: ink }}>
            <span className="font-semibold">Serviced Unit:</span> {invoice.serviced_unit}
          </p>
        )}

        <div className="mb-8">
          <p className="font-bold italic mb-2" style={{ color: ink }}>Bill To:</p>
          <div className="text-sm space-y-0.5" style={{ color: ink }}>
            <div>{invoice.customer_name}</div>
            {invoice.customer_email   && <div>Email: {invoice.customer_email}</div>}
            {invoice.customer_phone   && <div>Phone: {invoice.customer_phone}</div>}
            {invoice.customer_address && <div>Address: {invoice.customer_address}</div>}
            <div>Service Date: {dt}</div>
          </div>
        </div>

        <table className="w-full border-collapse text-sm mb-8">
          <thead>
            <tr style={{ background: headerBg }}>
              <th style={{ ...td, fontWeight: 600, textAlign: 'left' }}>Description</th>
              <th style={{ ...tdRight, fontWeight: 600, width: 128 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((l, i) => (
              <tr key={i}>
                <td style={td}>{l.description}</td>
                <td style={tdRight}>{fmtUSD(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={td}>Subtotal</td>
              <td style={tdRight}>{fmtUSD(invoice.subtotal)}</td>
            </tr>
            {Number(invoice.tax_rate) > 0 && (
              <tr>
                <td style={td}>Sales Tax ({invoice.tax_rate}%)</td>
                <td style={tdRight}>{fmtUSD(invoice.tax_amount)}</td>
              </tr>
            )}
            <tr style={{ background: totalBg, fontWeight: 700 }}>
              <td style={td}>Total</td>
              <td style={tdRight}>{fmtUSD(invoice.total)}</td>
            </tr>
          </tbody>
        </table>

        {invoice.notes && (
          <p className="text-sm italic mb-2 muted">{invoice.notes}</p>
        )}
        <p className="text-sm italic muted">{profile?.invoice_footer || 'Thank you for your business!'}</p>
      </div>
    </div>
  )
}
