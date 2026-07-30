// Background depth-fill for one order book row. Sized by the row's
// cumulative-quote fraction of the largest cumulative on that side.
// Right-aligned on asks, left-aligned on bids, per DESIGN.md. This is a
// decorative background layer only — it sits behind the row's text (earlier
// in DOM order, so later positioned siblings paint over it) and never
// carries information on its own; the numbers are the source of truth.

import type { Side } from '../../lib/types'

export interface DepthBarProps {
  side: Side
  /** 0..1 fraction of the largest cumulative total on this side. */
  fraction: number
}

export function DepthBar({ side, fraction }: DepthBarProps) {
  const pct = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) * 100 : 0
  const isBid = side === 'Bid'
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 ${isBid ? 'left-0 bg-bid-wash' : 'right-0 bg-ask-wash'}`}
      style={{ width: `${pct}%` }}
    />
  )
}
