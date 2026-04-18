const TONES = {
  brand:    { surface: 'bg-brand-50         dark:bg-brand-500/10',    accent: 'bg-brand-100       dark:bg-brand-500/25',    icon: 'text-brand-600        dark:text-brand-300' },
  mint:     { surface: 'bg-pastel-mint      dark:bg-emerald-500/10',  accent: 'bg-emerald-200     dark:bg-emerald-500/30',  icon: 'text-pastel-mintDeep  dark:text-emerald-300' },
  coral:    { surface: 'bg-pastel-coral     dark:bg-red-500/10',      accent: 'bg-red-200         dark:bg-red-500/30',      icon: 'text-pastel-coralDeep dark:text-red-300' },
  lavender: { surface: 'bg-pastel-lavender  dark:bg-indigo-500/10',   accent: 'bg-indigo-200      dark:bg-indigo-500/30',   icon: 'text-pastel-lavDeep   dark:text-indigo-300' },
  peach:    { surface: 'bg-pastel-peach     dark:bg-orange-500/10',   accent: 'bg-orange-200      dark:bg-orange-500/30',   icon: 'text-pastel-peachDeep dark:text-orange-300' },
  sky:      { surface: 'bg-pastel-sky       dark:bg-blue-500/10',     accent: 'bg-blue-200        dark:bg-blue-500/30',     icon: 'text-pastel-skyDeep   dark:text-blue-300' },
}

export default function StatCard({ label, value, sub, tone = 'brand', icon }) {
  const t = TONES[tone] || TONES.brand
  return (
    <div className={`rounded-xl2 p-5 shadow-card dark:shadow-none dark:ring-1 dark:ring-slate-800 ${t.surface}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">{label}</p>
          <p className="mt-1.5 text-3xl font-bold text-ink-strong dark:text-slate-100 leading-none">{value}</p>
          {sub && <p className="mt-2 text-xs text-ink-muted dark:text-slate-400">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.accent} ${t.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
