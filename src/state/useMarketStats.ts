// Derived 24h market stats. There is no ticker endpoint (see DESIGN.md's
// "Three things simply don't exist" table) — everything here comes from
// GET /candles?interval=1h&limit=24, plus the freshest tape trade for
// `lastPrice` when one is available.
//
// A never-traded pair returns `[]` from /candles. Every field is `null` in
// that case rather than `0` — a pair with zero history has no 24h high, and
// rendering `0` would claim a fact that isn't true.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { PAIR } from '../config'
import { getCandles } from '../lib/api'
import { useTapeStore } from './useTapeStore'

export interface MarketStats {
  high: number | null
  low: number | null
  volume: number | null
  /** last close - first open, over the trailing 24 hourly candles. */
  change: number | null
  /** change as a percentage of the first open. `null` when `change` is
   * `null`, or when the first open is `0` (division would be meaningless). */
  changePct: number | null
  /** Newest tape trade price when one exists (freshest signal); otherwise
   * the last candle's close. `null` when there's no data at all. */
  lastPrice: number | null
}

export interface UseMarketStatsResult extends MarketStats {
  isLoading: boolean
  isError: boolean
  error: UseQueryResult['error']
}

const EMPTY_STATS: MarketStats = {
  high: null,
  low: null,
  volume: null,
  change: null,
  changePct: null,
  lastPrice: null,
}

export function useMarketStats(): UseMarketStatsResult {
  const query = useQuery({
    queryKey: ['candles', PAIR, '1h', '24h-stats'],
    queryFn: () => getCandles(PAIR, '1h', { limit: 24 }),
  })

  const newestTrade = useTapeStore((s) => s.trades[0])

  const stats = useMemo<MarketStats>(() => {
    const candles = query.data
    if (!candles || candles.length === 0) {
      return { ...EMPTY_STATS, lastPrice: newestTrade?.price ?? null }
    }

    let high = -Infinity
    let low = Infinity
    let volume = 0
    for (const c of candles) {
      if (c.high > high) high = c.high
      if (c.low < low) low = c.low
      volume += c.volume
    }

    const firstOpen = candles[0].open
    const lastClose = candles[candles.length - 1].close
    const change = lastClose - firstOpen
    const changePct = firstOpen !== 0 ? (change / firstOpen) * 100 : null

    return {
      high,
      low,
      volume,
      change,
      changePct,
      lastPrice: newestTrade?.price ?? lastClose,
    }
  }, [query.data, newestTrade])

  return {
    ...stats,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
