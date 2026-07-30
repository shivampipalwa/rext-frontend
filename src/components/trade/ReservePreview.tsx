// The signature detail of the order-entry screen (DESIGN.md): this backend
// has a real available/reserved ledger split, so we show exactly what an
// order will lock — "Reserves 730 of your 9,400 USD" — as words and as a
// proportional bar, before the round trip to the server rather than after a
// `400`.

import { fmtInt } from '../../lib/format'
import type { Currency } from '../../lib/types'

export interface ReservePreviewProps {
  /** Amount this order will lock, in `currency` units. */
  amount: number
  available: number
  currency: Currency
  insufficient: boolean
}

export function ReservePreview({ amount, available, currency, insufficient }: ReservePreviewProps) {
  const pct = available > 0 ? Math.min(100, (amount / available) * 100) : amount > 0 ? 100 : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-num-form num ${insufficient ? 'text-ask' : 'text-ink'}`}>
          Reserves {fmtInt(amount)} of your {fmtInt(available)} {currency}
        </span>
        <span className="shrink-0 text-num-form num text-ink-2">{pct.toFixed(0)}% of avail</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-chip bg-panel-2" role="presentation">
        <div
          className={`h-full transition-[width] duration-150 motion-reduce:transition-none ${insufficient ? 'bg-ask' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {insufficient && (
        <p role="alert" className="text-ui-body text-ask">
          Not enough available {currency}. You have {fmtInt(available)}, this order needs {fmtInt(amount)}.
        </p>
      )}
    </div>
  )
}
