import { useState, useEffect, useCallback } from 'react'
import { fetchCalls, testConnection } from './api/vapi'
import { fmtDuration, callDuration, isBooked } from './utils/formatters'
import SetupScreen from './components/SetupScreen'
import StatCard from './components/StatCard'
import CallRow from './components/CallRow'
import CallDetail from './components/CallDetail'
import { Icons } from './components/Icons'

const STORAGE_KEY = 'max_crm_api_key'

function loadKey() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ currentKey, onSave, onClose }) {
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    const k = (key.trim() || currentKey)
    setTesting(true); setErr('')
    try {
      await testConnection(k)
      onSave(k)
    } catch {
      setErr('Invalid key or connection error.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
      <div className="fade-in" style={{
        position: 'fixed', top: 62, right: 16,
        background: '#13162b', border: '1px solid #1e2347',
        borderRadius: 12, padding: 20, width: 340, zIndex: 60,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>
          Vapi API Key
        </p>
        <input
          type="password"
          placeholder="Enter new API key…"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={{ marginBottom: 10 }}
        />
        {err && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{err}</p>}
        <button
          onClick={handleSave}
          disabled={testing}
          style={{
            width: '100%', padding: '9px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13,
          }}
        >
          {testing ? 'Testing…' : 'Save & Reconnect'}
        </button>
      </div>
    </>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey] = useState(loadKey)
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const loadCalls = useCallback(async () => {
    if (!apiKey) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchCalls(apiKey, { limit: 100 })
      setCalls(data)
    } catch (e) {
      setError(e.message || 'Failed to load calls.')
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  useEffect(() => { loadCalls() }, [loadCalls])

  function handleSaveKey(key) {
    localStorage.setItem(STORAGE_KEY, key)
    setApiKey(key)
    setShowSettings(false)
  }

  if (!apiKey) return <SetupScreen onSave={handleSaveKey} />

  // ── Stats ────────────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayCalls = calls.filter(c => new Date(c.createdAt) >= today)
  const bookedCalls = calls.filter(isBooked)
  const durations = calls
    .map(callDuration)
    .filter(d => d !== null)
  const avgDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = search.trim()
    ? calls.filter(c => {
        const q = search.toLowerCase()
        const sd = c.analysis?.structuredData || {}
        return (
          (sd.customerName || '').toLowerCase().includes(q) ||
          (sd.phoneNumber || '').includes(q) ||
          (c.customer?.number || '').includes(q) ||
          (sd.applianceType || '').toLowerCase().includes(q) ||
          (sd.problem || '').toLowerCase().includes(q) ||
          (c.analysis?.summary || '').toLowerCase().includes(q)
        )
      })
    : calls

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Topbar ── */}
      <div style={{
        background: '#13162b', borderBottom: '1px solid #1e2347',
        padding: '0 24px', height: 58,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icons.Wrench size={14} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Max CRM</span>
          <span style={{ fontSize: 12, color: '#475569' }}>Mike's Repair Shop</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={loadCalls}
            style={{
              background: '#1e2347', border: 'none', borderRadius: 8,
              padding: '7px 12px', color: '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <span className={loading ? 'spinner' : ''} style={{ display: 'inline-flex' }}>
              <Icons.Refresh />
            </span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{
              background: showSettings ? '#2d3260' : '#1e2347',
              border: 'none', borderRadius: 8,
              padding: '7px 12px', color: '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <Icons.Settings /> Settings
          </button>
        </div>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <SettingsPanel
          currentKey={apiKey}
          onSave={handleSaveKey}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Content ── */}
      <div style={{
        flex: 1, maxWidth: 1200, width: '100%',
        margin: '0 auto', padding: '24px',
      }}>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14, marginBottom: 24,
        }}>
          <StatCard
            label="Total Calls" value={calls.length} sub="all time"
            color="#6366f1" icon={<Icons.Phone />}
          />
          <StatCard
            label="Today" value={todayCalls.length} sub="calls today"
            color="#8b5cf6" icon={<Icons.Microphone />}
          />
          <StatCard
            label="Appointments" value={bookedCalls.length} sub="booked total"
            color="#10b981" icon={<Icons.Calendar />}
          />
          <StatCard
            label="Avg Duration" value={fmtDuration(avgDuration)} sub="per call"
            color="#f59e0b" icon={<Icons.Clock />}
          />
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)', color: '#475569',
          }}>
            <Icons.Search />
          </span>
          <input
            placeholder="Search by name, phone, appliance, problem…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#2d0a0a', border: '1px solid #7f1d1d',
            borderRadius: 10, padding: '12px 16px',
            color: '#f87171', fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Call list */}
        <div style={{
          background: '#13162b', border: '1px solid #1e2347',
          borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px 110px 70px 24px',
            gap: 12, padding: '10px 20px',
            borderBottom: '1px solid #1e2347',
          }}>
            {['Caller', 'Date & Time', 'Status', 'Duration', ''].map((h, i) => (
              <span key={i} style={{
                fontSize: 11, fontWeight: 600, color: '#475569',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {loading && calls.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
              <span className="spinner" style={{ display: 'inline-block', marginBottom: 12 }}>
                <Icons.Spinner />
              </span>
              <p>Loading calls…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
              {search ? 'No calls match your search.' : 'No calls yet. Make a test call to Max!'}
            </div>
          ) : (
            filtered.map(call => (
              <CallRow
                key={call.id}
                call={call}
                active={selected?.id === call.id}
                onClick={() => setSelected(selected?.id === call.id ? null : call)}
              />
            ))
          )}
        </div>

        <p style={{ fontSize: 11, color: '#2d3148', textAlign: 'center', marginTop: 16 }}>
          Powered by Vapi · Max AI Receptionist
        </p>
      </div>

      {/* Call detail panel */}
      {selected && (
        <CallDetail call={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
