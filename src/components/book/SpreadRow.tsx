// The divider between asks and bids: mid price (with a tick direction) and
// the absolute spread, per DESIGN.md's wireframe. Not interactive — it's a
// static row, not a price level.

import { useEffect, useRef, useState } from 'react'
import { fmtInt } from '../../lib/format'

export interface SpreadRowProps {
  bestBid: number | null
  bestAsk: number | null
}

export function SpreadRow({ bestBid, bestAsk }: SpreadRowProps) {
  const hasSpread = bestBid !== null && bestAsk !== null
  const mid = hasSpread ? Math.round((bestBid! + bestAsk!) / 2) : null
  const spread = hasSpread ? bestAsk! - bestBid! : null

  const prevMidRef = useRef<number | null>(null)
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (mid === null) return
    if (prevMidRef.current !== null && prevMidRef.current !== mid) {
      setDirection(mid > prevMidRef.current ? 'up' : 'down')
    }
    prevMidRef.current = mid
  }, [mid])

  return (
    <div
      role="row"
      className="flex h-row-book shrink-0 items-center justify-center gap-3 border-y border-hairline bg-panel-2 px-2 text-num-table"
    >
      <span role="cell">
        {hasSpread ? (
          <span className="flex items-center gap-3">
            <span className={direction === 'up' ? 'text-bid' : direction === 'down' ? 'text-ask' : 'text-ink'}>
              {direction && (
                <span aria-hidden="true">{direction === 'up' ? '▲ ' : '▼ '}</span>
              )}
              {fmtInt(mid!)}
            </span>
            <span aria-hidden="true" className="text-ink-3">
              &middot;
            </span>
            <span className="text-ink-2">
              Spread <span className="text-ink">{fmtInt(spread!)}</span>
            </span>
          </span>
        ) : (
          <span className="text-ink-2">No spread &mdash; one side of the book is empty</span>
        )}
      </span>
    </div>
  )
}
