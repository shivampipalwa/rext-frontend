// Full-width chrome bar: logo, pair, last price, the derived-24h slot,
// socket status + seq, wallet link, account menu. The 24h stats are
// prop-driven and rendered by DailyStats below — a later agent computes them
// from candles (see DESIGN.md: 24h high/low/vol/change derived from
// `GET /candles?interval=1h&limit=24`) and passes them in; until then this
// renders an honest dash, never a fake number.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BASE_CCY, PAIR } from '../../config'
import { fmtInt } from '../../lib/format'
import type { ConnState } from '../../lib/types'
import { StatusDot } from './StatusDot'

export interface DailyStats {
  changePct: number
  high: number
  low: number
  volumeBase: number
}

export function DailyStatsRow({ stats }: { stats: DailyStats | null }) {
  if (!stats) {
    return <span className="text-num-form num text-ink-3">24h — · H — · L — · Vol —</span>
  }
  const sign = stats.changePct >= 0 ? '+' : ''
  return (
    <span className="text-num-form num text-ink-2">
      24h {sign}
      {stats.changePct.toFixed(1)}% · H {fmtInt(stats.high)} · L {fmtInt(stats.low)} · Vol {fmtInt(stats.volumeBase)} {BASE_CCY}
    </span>
  )
}

export interface HeaderProps {
  lastPrice: number | null
  /** Tints the last price toward bid/ask for 300ms on tick, per DESIGN.md. */
  lastPriceTint?: 'bid' | 'ask' | null
  dailyStats?: DailyStats | null
  conn: ConnState
  seq: number
  isAuthenticated: boolean
  accountId: number | null
  accountMenu?: ReactNode
}

export function Header({ lastPrice, lastPriceTint, dailyStats = null, conn, seq, isAuthenticated, accountId, accountMenu }: HeaderProps) {
  const priceColor = lastPriceTint === 'bid' ? 'text-bid' : lastPriceTint === 'ask' ? 'text-ask' : 'text-ink'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-panel px-4">
      <div className="flex min-w-0 items-center gap-4">
        <Link to="/" className="flex shrink-0 items-center gap-1.5 text-ui-body text-accent">
          <span aria-hidden="true">⬢</span>
          <span className="tracking-wide">EXCHANGE</span>
        </Link>
        <span className="text-ui-body text-ink-2">{PAIR}</span>
        <span className={`text-last-price num transition-colors duration-300 ${priceColor}`}>
          {lastPrice !== null ? fmtInt(lastPrice) : '—'}
        </span>
        <div className="hidden lg:block">
          <DailyStatsRow stats={dailyStats} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden items-center gap-1.5 sm:flex">
          <StatusDot state={conn} />
          <span className="text-num-form num text-ink-2">seq {fmtInt(seq)}</span>
        </div>
        <Link to="/wallet" className="text-ui-body text-ink-2 transition-colors hover:text-ink">
          Wallet
        </Link>
        {isAuthenticated ? (
          (accountMenu ?? <span className="text-ui-body text-ink-2">Account {accountId ?? '—'}</span>)
        ) : (
          <Link to="/login" className="text-ui-body text-accent">
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
