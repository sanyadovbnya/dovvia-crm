import { useEffect, useState, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchMapCustomers, countPendingGeocodes, runGeocodeBatch } from '../utils/maps'
import { fmtPhone, telHref } from '../utils/phone'
import { Icons } from './Icons'

// Leaflet ships its default marker icons as a separate sprite, but the
// CSS path resolution breaks under Vite's bundler. Re-bind them to the
// CDN-served originals so pins actually render. (Tiny one-time cost.)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Spokane-ish fallback center. Used only when a tenant has zero
// geocoded customers; once they have one pin, we recenter on it.
const FALLBACK_CENTER = [47.6588, -117.4260]
const FALLBACK_ZOOM = 11

// Picks a tone for the pin based on the customer's recent activity.
// Live colored markers via L.divIcon so we don't fetch one PNG per
// status — keeps the network footprint tiny.
function makePinIcon(tone) {
  const color =
    tone === 'active'   ? '#10b981' :  // emerald
    tone === 'upcoming' ? '#f59e0b' :  // amber
    tone === 'stale'    ? '#94a3b8' :  // slate
                          '#6366f1'    // indigo (default)
  return L.divIcon({
    className: 'dovvia-pin',
    html: `
      <div style="
        width:18px;height:18px;border-radius:50%;
        background:${color};border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
      "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  })
}

function pinTone(c) {
  if ((c.upcoming || 0) > 0) return 'upcoming'
  // "Active" if any visit in last 6 months. lastDate is a YYYY-MM-DD string.
  if (c.lastDate) {
    const last = new Date(c.lastDate)
    if (Date.now() - last.getTime() < 1000 * 60 * 60 * 24 * 180) return 'active'
  }
  return 'stale'
}

function CustomerPopup({ customer }) {
  const visits = (customer.appointments || []).slice().sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') ||
    (b.time_start || '').localeCompare(a.time_start || '')
  )
  return (
    <div className="min-w-[220px] max-w-[260px]">
      <p className="font-bold text-sm text-ink-strong">{customer.name || 'Unknown'}</p>
      {customer.phone && (
        <a href={telHref(customer.phone) || `tel:${customer.phone}`} className="text-xs text-brand-600 hover:underline tabular-nums block">
          {fmtPhone(customer.phone)}
        </a>
      )}
      {customer.pinAddress && (
        <p className="text-[11px] text-ink-muted mt-0.5 break-words">{customer.pinAddress}</p>
      )}
      <div className="mt-2 pt-2 border-t border-slate-200 text-[11px]">
        <p className="text-ink-muted">
          {customer.total} visit{customer.total === 1 ? '' : 's'}
          {customer.upcoming > 0 && ` · ${customer.upcoming} upcoming`}
        </p>
      </div>
      {visits.length > 0 && (
        <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
          {visits.slice(0, 6).map(v => (
            <li key={v.id} className="text-[11px] text-ink-base flex justify-between gap-2">
              <span>{v.date || '—'}</span>
              <span className="text-ink-muted truncate">{v.service_type || v.notes || '—'}</span>
            </li>
          ))}
          {visits.length > 6 && (
            <li className="text-[11px] text-ink-muted italic">+ {visits.length - 6} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function MapPage() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(0)
  const [progress, setProgress] = useState(null)  // { processed, total } when geocoding
  const [err, setErr] = useState('')
  const cancelRef = useRef(false)

  async function refresh() {
    setLoading(true); setErr('')
    try {
      const [list, p] = await Promise.all([fetchMapCustomers(), countPendingGeocodes()])
      setCustomers(list)
      setPending(p)
    } catch (e) {
      setErr(e.message || 'Failed to load map')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    return () => { cancelRef.current = true }
  }, [])

  // Loop the geocode-pending function until the user's address backlog
  // is empty. Refreshes pins after each batch so they appear live as
  // the geocoder works through the queue.
  async function handleGeocode() {
    if (progress) return
    setErr('')
    let total = pending
    let processed = 0
    setProgress({ processed: 0, total })
    try {
      while (!cancelRef.current) {
        const r = await runGeocodeBatch()
        processed += r.processed
        if (r.processed === 0) break
        setProgress({ processed, total })
        // Refresh customer list so new pins show up.
        const [list, p] = await Promise.all([fetchMapCustomers(), countPendingGeocodes()])
        setCustomers(list)
        setPending(p)
        total = processed + p
        if (r.remaining === 0) break
      }
    } catch (e) {
      setErr(e.message || 'Geocode failed')
    } finally {
      setProgress(null)
    }
  }

  // Center on the average of all pinned customers; fall back to Spokane.
  const center = useMemo(() => {
    if (customers.length === 0) return FALLBACK_CENTER
    const sum = customers.reduce((a, c) => [a[0] + c.lat, a[1] + c.lng], [0, 0])
    return [sum[0] / customers.length, sum[1] / customers.length]
  }, [customers])

  return (
    <section className="mt-6 flex flex-col gap-3">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-ink-strong dark:text-slate-100">Customer map</h2>
          <p className="text-xs text-ink-muted dark:text-slate-400">
            {customers.length} pin{customers.length === 1 ? '' : 's'} ·{' '}
            {pending > 0
              ? `${pending} address${pending === 1 ? '' : 'es'} need geocoding`
              : 'all addresses geocoded'}
          </p>
        </div>
        {pending > 0 && (
          <button
            type="button"
            onClick={handleGeocode}
            disabled={!!progress}
            className="btn-ghost"
          >
            {progress
              ? <><Icons.Spinner /> Geocoding {progress.processed}/{progress.total}…</>
              : <><Icons.MapPin /> Geocode addresses</>}
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-xl2 bg-pastel-coral text-pastel-coralDeep dark:bg-red-500/15 dark:text-red-300 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      {/* Map */}
      <div className="card overflow-hidden">
        <div className="h-[60vh] sm:h-[70vh] w-full">
          <MapContainer
            center={center}
            zoom={FALLBACK_ZOOM}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {customers.map(c => (
              <Marker key={c.id || c.phone} position={[c.lat, c.lng]} icon={makePinIcon(pinTone(c))}>
                <Popup><CustomerPopup customer={c} /></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted dark:text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Active (last 6 mo)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500"></span> Upcoming visit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400"></span> Stale
        </span>
      </div>

      {loading && customers.length === 0 && (
        <p className="text-xs text-ink-muted dark:text-slate-400">Loading customer locations…</p>
      )}
    </section>
  )
}
