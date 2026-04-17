import { Link } from 'react-router-dom'

function Logo() {
  return (
    <div style={{
      width: 64, height: 64,
      background: 'linear-gradient(135deg, #E8952E, #D4811F)',
      borderRadius: 18,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 20px',
      boxShadow: '0 8px 32px rgba(232, 149, 46, 0.3)',
    }}>
      <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: 'Inter, sans-serif' }}>D</span>
    </div>
  )
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24,
      background: 'radial-gradient(ellipse at top, #1a1040 0%, #0f1117 50%, #0a0b10 100%)',
    }}>
      <div style={{ maxWidth: 480, width: '100%' }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Logo />
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9' }}>{title}</h1>
          {subtitle && (
            <p style={{ color: '#64748b', marginTop: 8, fontSize: 14 }}>{subtitle}</p>
          )}
        </div>

        <div style={{
          background: '#13162b',
          border: '1px solid #1e2347',
          borderRadius: 16,
          padding: 32,
        }}>
          {children}
        </div>

        {footer && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            {footer}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, marginTop: 32,
          borderTop: '1px solid #1e2347', paddingTop: 20,
        }}>
          <Link to="/" style={{ fontSize: 12, color: '#475569', textDecoration: 'none' }}>Terms</Link>
          <span style={{ color: '#2d3148' }}>·</span>
          <Link to="/" style={{ fontSize: 12, color: '#475569', textDecoration: 'none' }}>Privacy</Link>
          <span style={{ color: '#2d3148' }}>·</span>
          <span style={{ fontSize: 12, color: '#475569' }}>© 2026 Dovvia</span>
        </div>
      </div>
    </div>
  )
}
