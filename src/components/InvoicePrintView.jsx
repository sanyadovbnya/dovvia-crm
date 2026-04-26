import { useEffect } from 'react'
import { fmtUSD } from '../utils/invoices'

// A self-contained, white-background, print-friendly invoice rendered
// in a fullscreen overlay. Calls window.print() once mounted.
export default function InvoicePrintView({ invoice, profile, onClose }) {
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Slight delay so the layout is fully painted before print dialog
    const t = setTimeout(() => window.print(), 100)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = orig
    }
  }, [])

  const dt = new Date(invoice.service_date + 'T00:00').toLocaleDateString('en-US')

  return (
    <div className="fixed inset-0 z-[100] bg-white text-slate-900 overflow-auto print:static">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">Print-ready preview</p>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 text-sm">Print / Save as PDF</button>
          <button onClick={onClose} className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-10 py-12 font-sans">
        <h1 className="text-3xl font-bold text-center text-slate-900 mb-1">
          {profile?.shop_name || 'Your Shop'}
        </h1>
        <div className="text-center text-sm text-slate-700 leading-relaxed mb-10">
          {profile?.business_address && <div>{profile.business_address}</div>}
          <div>
            {profile?.business_email && <>Email: {profile.business_email}</>}
            {profile?.business_email && profile?.twilio_from_number && ' | '}
            {profile?.twilio_from_number && <>Phone: {profile.twilio_from_number}</>}
          </div>
          {profile?.business_website && <div>{profile.business_website}</div>}
        </div>

        <h2 className="text-xl font-bold mb-2">INVOICE #{invoice.invoice_number}</h2>
        {invoice.serviced_unit && (
          <p className="text-sm mb-6"><span className="font-semibold">Serviced Unit:</span> {invoice.serviced_unit}</p>
        )}

        <div className="mb-8">
          <p className="font-bold italic mb-2">Bill To:</p>
          <div className="text-sm space-y-0.5">
            <div>{invoice.customer_name}</div>
            {invoice.customer_email   && <div>Email: {invoice.customer_email}</div>}
            {invoice.customer_phone   && <div>Phone: {invoice.customer_phone}</div>}
            {invoice.customer_address && <div>Address: {invoice.customer_address}</div>}
            <div>Service Date: {dt}</div>
          </div>
        </div>

        <table className="w-full border-collapse text-sm mb-8">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-left font-semibold px-3 py-2 border border-slate-200">Description</th>
              <th className="text-right font-semibold px-3 py-2 border border-slate-200 w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2 border border-slate-200">{l.description}</td>
                <td className="px-3 py-2 border border-slate-200 text-right">{fmtUSD(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 border border-slate-200">Subtotal</td>
              <td className="px-3 py-2 border border-slate-200 text-right">{fmtUSD(invoice.subtotal)}</td>
            </tr>
            {Number(invoice.tax_rate) > 0 && (
              <tr>
                <td className="px-3 py-2 border border-slate-200">Sales Tax ({invoice.tax_rate}%)</td>
                <td className="px-3 py-2 border border-slate-200 text-right">{fmtUSD(invoice.tax_amount)}</td>
              </tr>
            )}
            <tr className="bg-slate-50 font-bold">
              <td className="px-3 py-2 border border-slate-200">Total</td>
              <td className="px-3 py-2 border border-slate-200 text-right">{fmtUSD(invoice.total)}</td>
            </tr>
          </tbody>
        </table>

        {invoice.notes && (
          <p className="text-sm text-slate-700 italic mb-2">{invoice.notes}</p>
        )}
        <p className="text-sm italic text-slate-700">{profile?.invoice_footer || 'Thank you for your business!'}</p>
      </div>
    </div>
  )
}
