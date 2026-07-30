// One trade tape row. Price is tinted by takerSide per API.md's WebSocket
// section: "`trade` ... taker_side is the aggressor: `Ask` means a seller
// crossed the spread (sold into a bid)." A seller crossing into a bid is
// downward pressure, so `Ask` renders --ask (red); `Bid` renders --bid
// (green). Colour is never the only signal, so each row also carries a
// ▲/▼ affordance and an explicit Buy/Sell word in its accessible name.
//
// New rows fade in over 120ms via the `tape-fade-in` keyframe declared once
// by TradeTape. Because trades are keyed by `seq` and existing entries keep
// their identity across re-renders (useTapeStore only prepends), the
// animation plays once on mount and never replays for rows that were
// already on screen.

import { memo } from 'react'
import type { Trade } from '../../lib/types'
import { fmtInt, fmtTime } from '../../lib/format'

export interface TapeRowProps {
  trade: Trade
}

function TapeRowImpl({ trade }: TapeRowProps) {
  const isBidTaker = trade.takerSide === 'Bid'
  const sideColor = isBidTaker ? 'text-bid' : 'text-ask'
  const arrow = isBidTaker ? '▲' : '▼'
  const label = isBidTaker ? 'Buy' : 'Sell'

  return (
    <li
      className="tape-fade-in flex h-row-book shrink-0 items-center gap-2 px-1"
      aria-label={`${label} ${fmtInt(trade.qty)} at ${fmtInt(trade.price)}, ${fmtTime(trade.ts)}`}
    >
      <span aria-hidden="true" className={`flex-1 text-left text-num-table ${sideColor}`}>
        {arrow} {fmtInt(trade.price)}
      </span>
      <span aria-hidden="true" className="flex-1 text-right text-num-table text-ink">
        {fmtInt(trade.qty)}
      </span>
      <span aria-hidden="true" className="flex-1 text-right text-num-table text-ink-2">
        {fmtTime(trade.ts)}
      </span>
    </li>
  )
}

export const TapeRow = memo(TapeRowImpl)
