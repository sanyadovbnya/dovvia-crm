export default function StatCard({ label, value, sub, color = '#6366f1', icon }) {
  return (
    <div style={{
      background: '#13162b',
      border: '1px solid #1e2347',
      borderRadius: 14,
      padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{
            fontSize: 12, color: '#64748b', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
          }}>
            {label}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{value}</p>
          {sub && <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{sub}</p>}
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: color + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          {icon}
        </div>
      </div>
    </div>
  )
}
