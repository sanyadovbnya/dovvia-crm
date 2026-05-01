const TONES = {
  brand:    { surface: 'bg-brand-50         dark:bg-brand-500/10',    accent: 'bg-brand-100       dark:bg-brand-500/25',    icon: 'text-brand-600        dark:text-brand-300' },
  mint:     { surface: 'bg-pastel-mint      dark:bg-emerald-500/10',  accent: 'bg-emerald-200     dark:bg-emerald-500/30',  icon: 'text-pastel-mintDeep  dark:text-emerald-300' },
  coral:    { surface: 'bg-pastel-coral     dark:bg-red-500/10',      accent: 'bg-red-200         dark:bg-red-500/30',      icon: 'text-pastel-coralDeep dark:text-red-300' },
  lavender: { surface: 'bg-pastel-lavender  dark:bg-indigo-500/10',   accent: 'bg-indigo-200      dark:bg-indigo-500/30',   icon: 'text-pastel-lavDeep   dark:text-indigo-300' },
  peach:    { surface: 'bg-pastel-peach     dark:bg-orange-500/10',   accent: 'bg-orange-200      dark:bg-orange-500/30',   icon: 'text-pastel-peachDeep dark:text-orange-300' },
  sky:      { surface: 'bg-pastel-sky       dark:bg-blue-500/10',     accent: 'bg-blue-200        dark:bg-blue-500/30',     icon: 'text-pastel-skyDeep   dark:text-blue-300' },
}

// When `onClick` is supplied the card renders as a button with hover/focus
// affordances. Otherwise it stays a plain div so non-interactive stats don't
// look clickable.
export default function StatCard({ label, value, sub, tone = 'brand', icon, onClick, title }) {
  const t = TONES[tone] || TONES.brand
  const interactive = typeof onClick === 'function'
  const base = `rounded-xl2 p-3.5 shadow-card dark:shadow-none dark:ring-1 dark:ring-slate-800 ${t.surface}`
  const interactiveCx = 'text-left w-full transition hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer'
  const inner = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">{label}</p>
        <p className="mt-1 text-xl sm:text-2xl font-bold text-ink-strong dark:text-slate-100 leading-none">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-ink-muted dark:text-slate-400 truncate">{sub}</p>}
      </div>
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.accent} ${t.icon} shrink-0`}>
        {icon}
      </div>
    </div>
  )
  if (interactive) {
    return (
      <button type="button" onClick={onClick} title={title} className={`${base} ${interactiveCx}`}>
        {inner}
      </button>
    )
  }
  return <div className={base} title={title}>{inner}</div>
}
