import { Icons } from './Icons'
import { smsHref } from '../utils/sms'

// Green message-bubble button that opens the device's SMS composer
// pre-filled with `body`. Renders nothing when there's no dialable
// number. Stops click propagation so opening it from inside a list
// row doesn't also trigger the row's own click handler.
export default function SmsButton({ phone, body, size = 'md', label = 'Text caller', className = '' }) {
  const href = smsHref(phone, body)
  if (!href) return null
  const sizeCx =
    size === 'lg' ? 'h-12 w-12' :
    size === 'sm' ? 'h-8 w-8'  :
                    'h-10 w-10'
  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 14 : 18
  return (
    <a
      href={href}
      onClick={e => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={`shrink-0 inline-flex ${sizeCx} items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-card transition ${className}`}
    >
      <Icons.Message size={iconSize} />
    </a>
  )
}
