// Shared PDF helpers used by:
//   - <InvoicePrintView>: interactive overlay → user-triggered download/print
//   - emailInvoicePdf flow: off-screen render → upload to Supabase Storage
//
// All exports are framework-agnostic (no React imports here). The off-screen
// renderer uses createRoot, but accepts the InvoiceSheet component as a
// caller-provided element so this module doesn't depend on JSX.

import { createRoot } from 'react-dom/client'

export function pdfFilename(invoice) {
  const safeName = (invoice.customer_name || 'customer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `invoice-${invoice.invoice_number}-${safeName}.pdf`
}

export async function imagesReady(root) {
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
  // Direct fetch first (works for Supabase Storage and any CORS-enabled host).
  // Falls back to images.weserv.nl, a public CORS proxy, for hosts that don't
  // serve Access-Control-Allow-Origin (typically WordPress / shared hosting).
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

// Replaces remote img srcs with base64 data URLs in place. html2canvas can't
// rasterize cross-origin images without CORS; failures are non-fatal.
export async function inlineImages(root) {
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

const HTML2PDF_OPTIONS = {
  margin: [0.5, 0.5, 0.5, 0.5],
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false },
  jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
}

// Triggers a browser download of `node` rendered as PDF.
// Used by InvoicePrintView's "Download PDF" button.
export async function downloadNodeAsPdf(node, filename) {
  await imagesReady(node)
  await inlineImages(node)
  const { default: html2pdf } = await import('html2pdf.js')
  await html2pdf()
    .from(node)
    .set({ ...HTML2PDF_OPTIONS, filename })
    .save()
}

// Renders the given React element off-screen and returns the resulting PDF
// as a Blob. Used by the email flow to upload to Supabase Storage.
//
// The container is positioned far off-screen rather than display:none so
// html2canvas can still measure layout (display:none zeroes dimensions).
export async function renderElementToPdfBlob(reactElement) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = '816px' // letter @ 96dpi (8.5in × 96)
  container.style.background = '#ffffff'
  container.style.zIndex = '-1'
  document.body.appendChild(container)

  const root = createRoot(container)
  try {
    await new Promise(res => {
      root.render(reactElement)
      // Two RAFs: first for React commit, second for layout/paint.
      requestAnimationFrame(() => requestAnimationFrame(res))
    })

    const sheet = container.firstElementChild
    if (!sheet) throw new Error('Invoice sheet failed to render')

    await imagesReady(sheet)
    await inlineImages(sheet)

    const { default: html2pdf } = await import('html2pdf.js')
    return await html2pdf()
      .from(sheet)
      .set(HTML2PDF_OPTIONS)
      .outputPdf('blob')
  } finally {
    root.unmount()
    container.remove()
  }
}
