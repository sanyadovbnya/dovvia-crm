import { useEffect, useRef, useState } from 'react'
import { fmtUSD } from '../utils/invoices'

async function imagesReady(root) {
  const imgs = Array.from((root || document).querySelectorAll('img'))
  await Promise.all(imgs.map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise(res => {
          img.addEventListener('load', res, { once: true })
          img.addEventListener('error', res, { once: true })
        })
  ))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function fetchAsDataUrl(url) {
  // Try direct fetch first (works for Supabase Storage and any host with
  // proper CORS headers). Falls back to the public images.weserv.nl proxy,
  // which re-serves any public image with permissive CORS — needed for
  // logos hosted on plain WordPress / shared hosting that doesn't set
  // Access-Control-Allow-Origin on uploads.
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await blobToDataUrl(await res.blob())
  } catch {
    const stripped = url.replace(/^https?:\/\//, '')
    const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}`
    const res = await fetch(proxied, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`proxy HTTP ${res.status}`)
    return await blobToDataUrl(await res.blob())
  }
}

// Convert remote <img> srcs to base64 data URLs in place. html2canvas can't
// rasterize cross-origin images without CORS headers, so we inline them first.
// Failures are logged but non-fatal — the PDF will just render without that image.
async function inlineImages(root) {
  if (!root) return
  const imgs = Array.from(root.querySelectorAll('img'))
  for (const img of imgs) {
    if (!img.src || img.src.startsWith('data:')) continue
    try {
      const dataUrl = await fetchAsDataUrl(img.src)
      img.src = dataUrl
      if (!img.complete) {
        await new Promise(res => {
          img.addEventListener('load', res, { once: true })
          img.addEventListener('error', res, { once: true })
        })
      }
    } catch (e) {
      console.warn('[invoice pdf] could not inline image, will be omitted:', img.src, e?.message)
    }
  }
}

function pdfFilename(invoice) {
  const safeName = (invoice.customer_name || 'customer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `invoice-${invoice.invoice_number}-${safeName}.pdf`
}

// White-background invoice rendered in a fullscreen overlay.
// Two actions: native browser print, or direct PDF download via html2pdf.
export default function InvoicePrintView({ invoice, profile, onClose }) {
  const sheetRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = orig }
  }, [])

  async function handlePrint() {
    await imagesReady(sheetRef.current)
    window.print()
  }

  async function handleDownloadPdf() {
    if (!sheetRef.current || exporting) return
    setExporting(true)
    try {
      await imagesReady(sheetRef.current)
      await inlineImages(sheetRef.current)
      const { default: html2pdf } = await import('html2pdf.js')
      await html2pdf()
        .from(sheetRef.current)
        .set({
          margin: [0.5, 0.5, 0.5, 0.5],
          filename: pdfFilename(invoice),
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
          },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
        })
        .save()
    } finally {
      setExporting(false)
    }
  }

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
      className="invoice-print-root fixed inset-0 z-[100] overflow-auto print:static"
      style={{ background: '#ffffff', color: ink, colorScheme: 'light' }}
    >
      <style>{`
        /* On-screen */
        .invoice-print, .invoice-print * { color: ${ink}; }
        .invoice-print .muted { color: ${sub}; }

        @media print {
          @page { size: letter; margin: 0.5in; }

          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide everything in the app except this overlay */
          body > *:not(.invoice-print-root),
          body > *:not(.invoice-print-root) * { display: none !important; }

          /* Flatten the overlay so the full content prints, not just the viewport */
          .invoice-print-root {
            position: static !important;
            inset: auto !important;
            overflow: visible !important;
            height: auto !important;
            width: auto !important;
            z-index: auto !important;
          }

          .no-print { display: none !important; }

          .invoice-print, .invoice-print * {
            color: ${ink} !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          .invoice-print table { page-break-inside: auto; }
          .invoice-print tr    { page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: `1px solid ${line}` }}>
        <p className="text-sm muted">Invoice preview</p>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={exporting}
            className="rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 text-sm"
            style={{ color: '#ffffff' }}
          >
            {exporting ? 'Generating PDF…' : 'Download PDF'}
          </button>
          <button
            onClick={handlePrint}
            className="rounded-xl bg-slate-100 hover:bg-slate-200 font-medium px-4 py-2 text-sm"
          >
            Print
          </button>
          <button onClick={onClose} className="rounded-xl bg-slate-100 hover:bg-slate-200 font-medium px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>

      <div ref={sheetRef} className="invoice-print max-w-3xl mx-auto px-10 py-12 font-sans" style={{ background: '#ffffff' }}>
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
