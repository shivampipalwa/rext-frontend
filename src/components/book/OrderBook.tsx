// Order book: asks descending above the spread (worst at top, best just
// above), spread row, bids descending below (best at top). Reads
// useBookStore directly — no props, per DESIGN.md's split of the sockets
// from React Query. Renders content only; the route supplies the <Panel>.
//
// role="table" is a div-based ARIA table, not a native <table>, because rows
// are real <button>s (click-to-prefill) — a native <table> can't host that
// without breaking row/cell semantics worse than this pattern does. Live
// region is aria-live="off": a book updating several times a second would
// otherwise flood a screen reader (DESIGN.md, Accessibility).
//
// Perf note: this component itself DOES subscribe to the whole bids/asks
// Maps, because the Total column is a running cumulative that can, in the
// worst case (a change at the best price), depend on every level on that
// side — there is no way to compute "cumulative from best outward" without
// looking at the whole side. Sorting and summing ~50 levels on every store
// write is cheap. What must NOT happen is 50 row components re-rendering for
// one level's change, and that's handled in BookRow: it receives primitive
// props and is React.memo'd, and it separately subscribes to its OWN qty via
// a narrow selector for the flash. A delta away from the spread only touches
// the handful of rows at or beyond it; only a best-price delta cascades to
// the whole side's Total column, which is inherent to the definition of a
// cumulative total, not a missed optimization.

import { useMemo } from 'react'
import { useBookStore } from '../../state/useBookStore'
import { BookRow } from './BookRow'
import { SpreadRow } from './SpreadRow'

interface DisplayLevel {
  price: number
  cumQty: number
  cumQuote: number
}

function withCumulative(entries: [number, number][]): DisplayLevel[] {
  let cumQty = 0
  let cumQuote = 0
  const out: DisplayLevel[] = []
  for (const [price, qty] of entries) {
    cumQty += qty
    cumQuote += price * qty
    out.push({ price, cumQty, cumQuote })
  }
  return out
}

export function OrderBook() {
  const bids = useBookStore((s) => s.bids)
  const asks = useBookStore((s) => s.asks)
  const conn = useBookStore((s) => s.conn)

  const { asksDisplay, bidsDisplay, maxAskQuote, maxBidQuote, bestBid, bestAsk } = useMemo(() => {
    const askEntries = Array.from(asks.entries()).sort((a, b) => a[0] - b[0]) // ascending, best (lowest) first
    const bidEntries = Array.from(bids.entries()).sort((a, b) => b[0] - a[0]) // descending, best (highest) first

    const askLevels = withCumulative(askEntries)
    const bidLevels = withCumulative(bidEntries)

    return {
      // Worst ask at top, best ask just above the spread.
      asksDisplay: [...askLevels].reverse(),
      // Best bid at top, worst bid at bottom — already in the right order.
      bidsDisplay: bidLevels,
      maxAskQuote: askLevels.length ? askLevels[askLevels.length - 1].cumQuote : 0,
      maxBidQuote: bidLevels.length ? bidLevels[bidLevels.length - 1].cumQuote : 0,
      bestBid: bidEntries.length ? bidEntries[0][0] : null,
      bestAsk: askEntries.length ? askEntries[0][0] : null,
    }
  }, [bids, asks])

  const isEmpty = asksDisplay.length === 0 && bidsDisplay.length === 0

  return (
    <div role="table" aria-label="Order book" aria-live="off" className="flex h-full flex-col overflow-y-auto">
      {/* Scoped keyframes for the row flash — the one animation in the app
          that carries information. prefers-reduced-motion is handled
          globally in theme.css (it collapses all animation-duration to
          0.01ms), so no extra logic is needed here to disable it. */}
      <style>{`
        @keyframes book-flash-bid { from { background-color: var(--color-bid-wash); } to { background-color: transparent; } }
        @keyframes book-flash-ask { from { background-color: var(--color-ask-wash); } to { background-color: transparent; } }
        .book-flash-bid { animation: book-flash-bid 240ms ease-out; }
        .book-flash-ask { animation: book-flash-ask 240ms ease-out; }
      `}</style>

      <div role="row" className="sticky top-0 z-10 flex h-row-book shrink-0 items-center gap-2 bg-panel px-1">
        <span role="columnheader" className="flex-1 text-left text-panel-label">
          Price
        </span>
        <span role="columnheader" className="flex-1 text-right text-panel-label">
          Size
        </span>
        <span role="columnheader" className="flex-1 text-right text-panel-label">
          Total
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-ui-body text-ink-2">
          {conn === 'connecting'
            ? 'Loading order book…'
            : 'No orders on this market yet — be the first to trade.'}
        </div>
      ) : (
        <>
          <div role="rowgroup" className="flex flex-col justify-end">
            {asksDisplay.map((lvl) => (
              <BookRow
                key={lvl.price}
                price={lvl.price}
                side="Ask"
                cumQuote={lvl.cumQuote}
                cumQty={lvl.cumQty}
                depthFraction={maxAskQuote ? lvl.cumQuote / maxAskQuote : 0}
              />
            ))}
          </div>

          <SpreadRow bestBid={bestBid} bestAsk={bestAsk} />

          <div role="rowgroup" className="flex flex-col">
            {bidsDisplay.map((lvl) => (
              <BookRow
                key={lvl.price}
                price={lvl.price}
                side="Bid"
                cumQuote={lvl.cumQuote}
                cumQty={lvl.cumQty}
                depthFraction={maxBidQuote ? lvl.cumQuote / maxBidQuote : 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
