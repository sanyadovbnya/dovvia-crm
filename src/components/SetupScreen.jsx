import { useState } from 'react'
import { testConnection } from '../api/vapi'
import { Icons } from './Icons'

export default function SetupScreen({ onSave }) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [testing, setTesting] = useState(false)

  async function handleConnect() {
    if (!key.trim()) { setErr('Please enter your Vapi API key.'); return }
    setTesting(true)
    setErr('')
    try {
      await testConnection(key.trim())
      await onSave(key.trim())
    } catch (e) {
      setErr(e.message || 'Could not connect. Double-check your API key and try again.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 420, width: '100%' }} className="fade-in">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, #E8952E, #D4811F)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Icons.Wrench />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>Dovvia CRM</h1>
          <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>
            Connect your Vapi API to get started
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#13162b', border: '1px solid #1e2347',
          borderRadius: 16, padding: 28,
        }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 500,
            color: '#94a3b8', marginBottom: 8,
          }}>
            Vapi API Key
          </label>
          <input
            type="password"
            placeholder="vapi_xxxxxxxxxxxxxxxx..."
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            style={{ marginBottom: 8 }}
          />
          <p style={{ fontSize: 12, color: '#475569', marginBottom: 20 }}>
            Find it at{' '}
            <a href="https://dashboard.vapi.ai" target="_blank" rel="noreferrer"
              style={{ color: '#E8952E' }}>
              dashboard.vapi.ai
            </a>{' '}
            → Account → API Keys
          </p>

          {err && (
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>{err}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={testing}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: testing ? '#B8741F' : 'linear-gradient(135deg, #E8952E, #D4811F)',
              color: '#fff', fontWeight: 600, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {testing ? <><Icons.Spinner /> Connecting…</> : 'Connect to Vapi'}
          </button>
        </div>
      </div>
    </div>
  )
}
