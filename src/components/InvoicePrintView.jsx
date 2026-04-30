import { useEffect, useRef, useState } from 'react'
import InvoiceSheet from './InvoiceSheet'
import { downloadNodeAsPdf, imagesReady, pdfFilename } from '../utils/invoicePdf'

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
      await downloadNodeAsPdf(sheetRef.current, pdfFilename(invoice))
    } finally {
      setExporting(false)
    }
  }

  const ink = '#0f172a'      // slate-900
  const sub = '#475569'      // slate-600
  const line = '#e2e8f0'     // slate-200

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

      <InvoiceSheet ref={sheetRef} invoice={invoice} profile={profile} />
    </div>
  )
}
