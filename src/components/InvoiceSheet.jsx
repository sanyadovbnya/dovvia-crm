import { forwardRef } from 'react'
import { fmtUSD } from '../utils/invoices'

// The visual invoice "sheet" — header, bill-to, line items, footer.
// Used by InvoicePrintView (interactive overlay) and by the email PDF
// pipeline (rendered into a hidden node and rasterized to a Blob).
//
// All inline styles use literal hex colors so the print and rasterized
// outputs look identical regardless of the active theme.

const COLORS = {
  ink:      '#0f172a',  // slate-900
  sub:      '#475569',  // slate-600
  line:     '#e2e8f0',  // slate-200
  headerBg: '#f1f5f9',  // slate-100
  totalBg:  '#f8fafc',  // slate-50
}

const td = { padding: '8px 12px', border: `1px solid ${COLORS.line}`, color: COLORS.ink }
const tdRight = { ...td, textAlign: 'right' }

const InvoiceSheet = forwardRef(function InvoiceSheet({ invoice, profile }, ref) {
  const dt = new Date(invoice.service_date + 'T00:00').toLocaleDateString('en-US')

  return (
    <div
      ref={ref}
      className="invoice-print max-w-3xl mx-auto px-10 py-12 font-sans"
      style={{ background: '#ffffff', color: COLORS.ink }}
    >
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

      <h1 className="text-3xl font-bold text-center mb-1" style={{ color: COLORS.ink }}>
        {profile?.shop_name || 'Your Shop'}
      </h1>
      <div className="text-center text-sm leading-relaxed mb-10" style={{ color: COLORS.ink }}>
        {profile?.business_address && <div>{profile.business_address}</div>}
        <div>
          {profile?.business_email && <>Email: {profile.business_email}</>}
          {profile?.business_email && profile?.twilio_from_number && ' | '}
          {profile?.twilio_from_number && <>Phone: {profile.twilio_from_number}</>}
        </div>
        {profile?.business_website && <div>{profile.business_website}</div>}
      </div>

      <h2 className="text-xl font-bold mb-2" style={{ color: COLORS.ink }}>
        INVOICE #{invoice.invoice_number}
      </h2>
      {invoice.serviced_unit && (
        <p className="text-sm mb-6" style={{ color: COLORS.ink }}>
          <span className="font-semibold">Serviced Unit:</span> {invoice.serviced_unit}
        </p>
      )}

      <div className="mb-8">
        <p className="font-bold italic mb-2" style={{ color: COLORS.ink }}>Bill To:</p>
        <div className="text-sm space-y-0.5" style={{ color: COLORS.ink }}>
          <div>{invoice.customer_name}</div>
          {invoice.customer_email   && <div>Email: {invoice.customer_email}</div>}
          {invoice.customer_phone   && <div>Phone: {invoice.customer_phone}</div>}
          {invoice.customer_address && <div>Address: {invoice.customer_address}</div>}
          <div>Service Date: {dt}</div>
        </div>
      </div>

      <table className="w-full border-collapse text-sm mb-8">
        <thead>
          <tr style={{ background: COLORS.headerBg }}>
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
          <tr style={{ background: COLORS.totalBg, fontWeight: 700 }}>
            <td style={td}>Total</td>
            <td style={tdRight}>{fmtUSD(invoice.total)}</td>
          </tr>
        </tbody>
      </table>

      {invoice.notes && (
        <p className="text-sm italic mb-2" style={{ color: COLORS.sub }}>{invoice.notes}</p>
      )}
      <p className="text-sm italic" style={{ color: COLORS.sub }}>
        {profile?.invoice_footer || 'Thank you for your business!'}
      </p>
    </div>
  )
})

export default InvoiceSheet
