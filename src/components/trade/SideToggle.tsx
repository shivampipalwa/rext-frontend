// Buy/Sell toggle. User-facing vocabulary, not schema vocabulary (DESIGN.md's
// "Interface copy" rules) — the underlying value is still `Side` (`Bid` /
// `Ask`) since that's what the API and the rest of the app key off, but
// nothing here ever prints "Bid" or "Ask".

import type { Side } from '../../lib/types'

export interface SideToggleProps {
  value: Side
  onChange: (side: Side) => void
  disabled?: boolean
}

export function SideToggle({ value, onChange, disabled }: SideToggleProps) {
  return (
    <div role="radiogroup" aria-label="Buy or sell" className="grid grid-cols-2 gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'Bid'}
        disabled={disabled}
        onClick={() => onChange('Bid')}
        className={`h-8 rounded-input border text-ui-body transition-colors disabled:opacity-50 ${
          value === 'Bid' ? 'border-bid bg-bid-wash text-bid' : 'border-hairline text-ink-2 hover:text-ink'
        }`}
      >
        Buy
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'Ask'}
        disabled={disabled}
        onClick={() => onChange('Ask')}
        className={`h-8 rounded-input border text-ui-body transition-colors disabled:opacity-50 ${
          value === 'Ask' ? 'border-ask bg-ask-wash text-ask' : 'border-hairline text-ink-2 hover:text-ink'
        }`}
      >
        Sell
      </button>
    </div>
  )
}
