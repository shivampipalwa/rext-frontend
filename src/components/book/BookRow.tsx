// One order book price level. A real <button> (keyboard + screen reader
// operable), not a div with onClick, per the click-to-prefill requirement.
//
// Perf: props are primitives only (price/side/cumQuote/cumQty/depthFraction)
// so React.memo's default shallow comparison bails a row out whenever the
// parent recomputes but this row's own slice of the result is unchanged.
// Separately, this component reads its OWN qty via a narrow zustand selector
// (`bids.get(price)` / `asks.get(price)`) instead of taking it as a prop —
// that subscription re-renders this row (and only this row) the instant its
// own level changes, independent of whatever caused the parent to
// re-render. The flash effect keys off that same narrow value, so it only
// ever fires on the row whose own qty actually changed, never as a side
// effect of a sibling's cumulative total shifting.

import { memo, useEffect, useRef, useState } from 'react'
import type { Side } from '../../lib/types'
import { fmtInt } from '../../lib/format'
import { useBookStore } from '../../state/useBookStore'
import { useOrderFormStore } from '../../state/useOrderFormStore'
import { DepthBar } from './DepthBar'

export interface BookRowProps {
  price: number
  side: Side
  /** Running cumulative quote-currency value through this level (the Total column). */
  cumQuote: number
  /** Running cumulative base-currency size through this level — what gets
   * handed to the order form on click, per DESIGN.md's "Total is quote
   * currency" vs. the form's size field being base currency. */
  cumQty: number
  /** 0..1 fraction of this side's largest cumulative total, for the depth bar. */
  depthFraction: number
}

function BookRowImpl({ price, side, cumQuote, cumQty, depthFraction }: BookRowProps) {
  const qty = useBookStore((s) => (side === 'Bid' ? s.bids : s.asks).get(price) ?? 0)

  const prevQtyRef = useRef<number | null>(null)
  const [flashNonce, setFlashNonce] = useState(0)

  useEffect(() => {
    if (prevQtyRef.current !== null && prevQtyRef.current !== qty) {
      setFlashNonce((n) => n + 1)
    }
    prevQtyRef.current = qty
  }, [qty])

  const isBid = side === 'Bid'
  const sideColor = isBid ? 'text-bid' : 'text-ask'
  const arrow = isBid ? '▲' : '▼'
  const flashClass = isBid ? 'book-flash-bid' : 'book-flash-ask'
  const sideLabel = isBid ? 'Bid' : 'Ask'

  return (
    <button
      type="button"
      role="row"
      onClick={() => useOrderFormStore.getState().setPrefill(price, cumQty)}
      aria-label={`${sideLabel} price ${fmtInt(price)}, size ${fmtInt(qty)}, total ${fmtInt(cumQuote)}. Fill order form with this price.`}
      className="relative flex h-row-book w-full shrink-0 items-center gap-2 px-1 text-left hover:bg-panel-2"
    >
      <DepthBar side={side} fraction={depthFraction} />
      {flashNonce > 0 && (
        <span key={flashNonce} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${flashClass}`} />
      )}
      <span aria-hidden="true" className={`relative flex-1 text-num-table ${sideColor}`}>
        {arrow} {fmtInt(price)}
      </span>
      <span aria-hidden="true" className="relative flex-1 text-right text-num-table text-ink">
        {fmtInt(qty)}
      </span>
      <span aria-hidden="true" className="relative flex-1 text-right text-num-table text-ink-2">
        {fmtInt(cumQuote)}
      </span>
    </button>
  )
}

export const BookRow = memo(BookRowImpl)
