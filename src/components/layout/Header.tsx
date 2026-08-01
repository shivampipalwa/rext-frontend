// Full-width chrome bar: wordmark, pair, last price, the derived-24h stats,
// socket status, wallet link, account menu.
//
// The 24h numbers are derived from `GET /candles?interval=1h&limit=24` —
// there is no ticker endpoint (DESIGN.md, "Three things simply don't exist").
// App.tsx computes them via useMarketStats and passes them in; the dash state
// below is for a market that has genuinely never traded, not for "we haven't
// wired this up yet."
//
// Each stat is a labelled pair rather than one run-on dash-separated string:
// H/L/Vol are different quantities in different units, and the label is what
// makes a bare integer readable in a market with no decimals.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BASE_CCY, PAIR } from '../../config'
import { fmtInt } from '../../lib/format'
import type { ConnState } from '../../lib/types'
import { StatusDot } from './StatusDot'

export interface DailyStats {
  /** Absolute change over the trailing 24 hourly candles, in quote units. */
  change: number
  changePct: number
  high: number
  low: number
  volumeBase: number
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{label}</span>
      <span className="num text-num-form text-ink-2">{children}</span>
    </span>
  )
}

export function DailyStatsRow({ stats }: { stats: DailyStats | null }) {
  if (!stats) {
    return (
      <div className="flex items-center gap-4">
        <Stat label="24h">—</Stat>
        <Stat label="High">—</Stat>
        <Stat label="Low">—</Stat>
        <Stat label="Vol">—</Stat>
      </div>
    )
  }

  const up = stats.change >= 0
  const sign = up ? '+' : '−'

  return (
    <div className="flex items-center gap-4">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">24h</span>
        <span className={`num text-num-form ${up ? 'text-bid' : 'text-ask'}`}>
          {sign}
          {fmtInt(Math.abs(stats.change))} ({sign}
          {Math.abs(stats.changePct).toFixed(1)}%)
        </span>
      </span>
      <Stat label="High">{fmtInt(stats.high)}</Stat>
      <Stat label="Low">{fmtInt(stats.low)}</Stat>
      <Stat label="Vol">
        {fmtInt(stats.volumeBase)} {BASE_CCY}
      </Stat>
    </div>
  )
}

export interface HeaderProps {
  lastPrice: number | null
  /** Tints the last price toward bid/ask for 300ms on tick, then clears. */
  lastPriceTint?: 'bid' | 'ask' | null
  dailyStats?: DailyStats | null
  conn: ConnState
  isAuthenticated: boolean
  accountId: number | null
  accountMenu?: ReactNode
}

export function Header({
  lastPrice,
  lastPriceTint,
  dailyStats = null,
  conn,
  isAuthenticated,
  accountId,
  accountMenu,
}: HeaderProps) {
  const priceColor = lastPriceTint === 'bid' ? 'text-bid' : lastPriceTint === 'ask' ? 'text-ask' : 'text-ink'

  return (
    // Sticky, not static: now that the page itself scrolls (App.tsx is no
    // longer h-screen), the header is the one piece of chrome worth keeping
    // on screen — live price, socket status, and nav shouldn't require
    // scrolling back up to check. z-30 keeps it above Panel's own sticky
    // sub-headers (z-10, scoped to their own scroll containers) and the
    // mobile bottom tab bar (z-20).
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-panel px-4">
      <div className="flex min-w-0 items-center gap-5">
        {/* The wordmark is the only place --brand appears in the UI (see
            theme.css). It lives in the far corner, never beside a price. */}
        <Link to="/" className="flex shrink-0 items-center gap-2 text-brand" aria-label="REXT home">
          <span aria-hidden="true" className="text-[15px] leading-none">⬢</span>
          <span className="text-[15px] font-semibold tracking-[0.14em]">REXT</span>
        </Link>

        {/* Pair and price are one unit — the price is meaningless without the
            pair, and a wide gap between them reads as two separate facts. */}
        <div className="flex shrink-0 items-baseline gap-2.5">
          <span className="text-ui-body text-ink-2">{PAIR}</span>
          <span className={`text-last-price num transition-colors duration-300 ${priceColor}`}>
            {lastPrice !== null ? fmtInt(lastPrice) : '—'}
          </span>
        </div>

        {/* 1120px, not Tailwind's xl: the stats row plus the pair/price
            cluster and the right-hand controls need about 1030px, so gating
            at 1280 left an empty header on every 1024–1279 display. */}
        <div className="hidden min-[1120px]:block">
          <DailyStatsRow stats={dailyStats} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {/* Connection state only. `seq` used to sit here as a gap detector,
            but marketSocket deliberately does NOT act on seq gaps — the public
            feed skips sequence numbers under completely normal use (a deposit,
            a trade on another pair), so a gap means nothing a user can act on.
            Real message loss shows up as a socket close, which this dot
            already reports. */}
        <div className="hidden items-center sm:flex">
          <StatusDot state={conn} />
        </div>
        {isAuthenticated ? (
          (accountMenu ?? <span className="text-ui-body text-ink-2">Account {accountId ?? '—'}</span>)
        ) : (
          <>
            <Link to="/wallet" className="text-ui-body text-ink-2 transition-colors hover:text-ink">
              Wallet
            </Link>
            <Link to="/login" className="btn btn-primary h-8">
              Sign in
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
