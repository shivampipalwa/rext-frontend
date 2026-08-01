// Trade tape — newest first (useTapeStore already orders and caps it).
// There is no historical-trades endpoint (API.md's "Known rough edges"), so
// this always starts empty on load and only ever fills from the socket;
// DESIGN.md specifies the empty-state copy verbatim, quoted below. Renders
// content only; the route supplies the <Panel>.
//
// aria-live="polite" announces each new trade as it arrives — the tape is
// meant to be a running commentary, unlike the book which is too frequent to
// announce (DESIGN.md, Accessibility).

import { useTapeStore } from '../../state/useTapeStore'
import { TapeRow } from './TapeRow'

export function TradeTape() {
  const trades = useTapeStore((s) => s.trades)

  return (
    <div role="log" aria-live="polite" aria-label="Recent trades" className="flex h-full flex-col overflow-y-auto">
      {/* Scoped keyframe for the new-row fade-in. prefers-reduced-motion is
          handled globally in theme.css. */}
      <style>{`
        @keyframes tape-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .tape-fade-in { animation: tape-fade-in 120ms ease-out; }
      `}</style>

      <div className="sticky top-0 z-10 flex h-row-book shrink-0 items-center gap-2 bg-panel px-1">
        <span className="flex-1 text-left text-panel-label">Price</span>
        <span className="flex-1 text-right text-panel-label">Size</span>
        <span className="flex-1 text-right text-panel-label">Time</span>
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-ui-body text-ink-2">
          Trades appear here as they happen.
        </div>
      ) : (
        <ul className="flex flex-1 flex-col">
          {/* Keyed on `id`, never `seq`: one command can emit several trades
              under a single seq, which made these keys collide (useTapeStore). */}
          {trades.map((trade) => (
            <TapeRow key={trade.id} trade={trade} />
          ))}
        </ul>
      )}
    </div>
  )
}
