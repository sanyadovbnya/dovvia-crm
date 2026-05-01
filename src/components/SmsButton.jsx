import { Icons } from './Icons'
import { smsHref } from '../utils/sms'

// Green message-bubble button that opens the device's SMS composer
// pre-filled with `body`. Renders nothing when there's no dialable
// number. Stops click propagation so opening it from inside a list
// row doesn't also trigger the row's own click handler.
//
// Sizes:
//   sm   — small square (table-cell decoration)
//   md   — medium square (default)
//   lg   — large square (detail panel quick-contact)
//   row  — stretches to row height, narrow & wider than `md`; meant for
//          living at the right edge of a list row as a tap target.
//   block — full-width pill with icon + label; meant to live below
//          other action buttons in the detail panel.
export default function SmsButton({
  phone, body, size = 'md', label = 'Text caller',
  showLabel = false, className = '',
}) {
  const href = smsHref(phone, body)
  if (!href) return null
  const layout =
    size === 'block' ? 'w-full h-11 px-4'      :
    // `row` stretches to the row's height and is square-ish (w-16 = 64px)
    // so list rows get a fat tap target instead of a slim chip.
    size === 'row'   ? 'self-stretch w-16 min-h-[64px]' :
    size === 'lg'    ? 'h-12 w-12'             :
    size === 'sm'    ? 'h-8 w-8'               :
                       'h-10 w-10'
  const iconSize =
    size === 'block' ? 18 :
    size === 'row'   ? 22 :
    size === 'lg'    ? 22 :
    size === 'sm'    ? 14 :
                       18
  return (
    <a
      href={href}
      onClick={e => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={`shrink-0 inline-flex ${layout} items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold shadow-card transition ${className}`}
    >
      <Icons.Message size={iconSize} />
      {showLabel && <span className="text-sm">{label}</span>}
    </a>
  )
}
