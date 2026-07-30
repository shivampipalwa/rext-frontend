// Candles for the chart. Wraps GET /candles in React Query and then fixes
// the two documented quirks (see API.md's `GET /candles/:pair` section)
// entirely at this layer, so PriceChart only ever sees a clean, continuous
// series:
//
//   1. No gap-filling — a quiet bucket is simply absent from the response.
//      We synthesize flat candles (open=high=low=close=prevClose, volume=0)
//      for every missing bucket between the first and last REAL candle
//      returned. We never extrapolate past the last real candle — an
//      actually-quiet "now" should trail off, not draw a fake flat line
//      into the future.
//   2. `1w` buckets start Thursday (floor(t / interval), Unix epoch was a
//      Thursday) — that's surfaced in the UI (IntervalTabs' tooltip), not
//      "fixed" here; fixing it would misrepresent what the server actually
//      grouped together.
//
// On top of the REST fetch, new trades from the public WebSocket (already
// landing in useTapeStore) extend the newest candle in place — see
// `applyLiveTrade`. We watermark on trade `seq` so a trade that a refetch's
// fresh candles already reflect never gets applied twice.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { PAIR } from '../config'
import { getCandles, type CandleInterval } from '../lib/api'
import type { Candle, Trade } from '../lib/types'
import { useTapeStore } from './useTapeStore'

/** Bucket size in seconds, per interval. Matches the server's
 * `floor(unix_time / interval_seconds)` bucketing exactly. */
export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1s': 1,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
}

/** How many real candles to ask for. Comfortably under the API's 1000 cap
 * and enough history to be useful on every interval. */
const FETCH_LIMIT = 500

/** Global budget for synthesized candles across the WHOLE series — not per
 * gap. The distinction matters: `GET /candles` returns the most recent
 * `limit` buckets THAT HAD A TRADE, so on a sparse market the returned
 * candles can span an enormous wall-clock range. 500 `1s` candles from a
 * market that trades once a minute span 500 minutes = 30,000 buckets to
 * fill; once an hour, 1.8M. A per-gap cap doesn't help — it's the sum that
 * kills the tab.
 *
 * The budget is spent NEWEST-FIRST so it goes to the span the viewport
 * actually shows. A gap too large for the remaining budget is left unfilled
 * (a visible jump) rather than partially filled, which would leave a jump
 * anyway while costing the budget. */
const MAX_SYNTHETIC_CANDLES = 3_000

function bucketStart(unixSeconds: number, interval: CandleInterval): number {
  const size = INTERVAL_SECONDS[interval]
  return Math.floor(unixSeconds / size) * size
}

function flatCandle(time: number, prevClose: number): Candle {
  return { time, open: prevClose, high: prevClose, low: prevClose, close: prevClose, volume: 0 }
}

/** Fills every missing bucket between consecutive real candles with a flat
 * candle at the previous close. Exported for testing/reasoning about the
 * algorithm in isolation. */
export function gapFillCandles(candles: Candle[], interval: CandleInterval): Candle[] {
  if (candles.length < 2) return candles
  const size = INTERVAL_SECONDS[interval]

  // Walk newest -> oldest so the synth budget is spent on the most recent
  // span rather than exhausted on ancient history the user has to scroll
  // back to reach. Output is built descending and reversed at the end.
  const descending: Candle[] = []
  let budget = MAX_SYNTHETIC_CANDLES

  for (let i = candles.length - 1; i > 0; i--) {
    const curr = candles[i]
    const prev = candles[i - 1]
    descending.push(curr)

    const missing = Math.floor((curr.time - prev.time) / size) - 1
    if (missing <= 0 || missing > budget) continue // too big to fill: leave the jump
    budget -= missing
    for (let k = 1; k <= missing; k++) {
      descending.push(flatCandle(curr.time - k * size, prev.close))
    }
  }
  descending.push(candles[0])

  return descending.reverse()
}

/** Extends (or opens) the newest candle with one live trade. `trade.ts` is
 * the client's receive time in ms (the public feed carries no server
 * timestamp — see lib/types.ts) and is what we bucket on. */
export function applyLiveTrade(candles: Candle[], trade: Trade, interval: CandleInterval): Candle[] {
  const size = INTERVAL_SECONDS[interval]
  const bucket = bucketStart(Math.floor(trade.ts / 1000), interval)

  if (candles.length === 0) {
    return [{ time: bucket, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.qty }]
  }

  const last = candles[candles.length - 1]
  if (bucket < last.time) return candles // stale relative to what we already have — drop it

  if (bucket === last.time) {
    const updated: Candle = {
      ...last,
      high: Math.max(last.high, trade.price),
      low: Math.min(last.low, trade.price),
      close: trade.price,
      volume: last.volume + trade.qty,
    }
    return [...candles.slice(0, -1), updated]
  }

  // The trade crossed into a new bucket — flat-fill the gap (if any) up to
  // it, matching the same backfill rule as the REST gap-fill above, then
  // open a fresh candle from the trade itself.
  const filler: Candle[] = []
  let t = last.time + size
  let steps = 0
  while (t < bucket && steps < MAX_SYNTHETIC_CANDLES) {
    filler.push(flatCandle(t, last.close))
    t += size
    steps++
  }
  const fresh: Candle = { time: bucket, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.qty }
  return [...candles, ...filler, fresh]
}

export interface UseCandlesResult {
  candles: Candle[]
  isLoading: boolean
  isError: boolean
  error: UseQueryResult<Candle[]>['error']
  refetch: UseQueryResult<Candle[]>['refetch']
}

export function useCandles(interval: CandleInterval): UseCandlesResult {
  const query = useQuery({
    queryKey: ['candles', PAIR, interval],
    queryFn: () => getCandles(PAIR, interval, { limit: FETCH_LIMIT }),
  })

  const [liveCandles, setLiveCandles] = useState<Candle[]>([])
  // Watermark: the newest trade `seq` already reflected in `liveCandles`.
  // Trades at or below this seq are presumed already baked into the last
  // successful fetch and must not be re-applied on top of it.
  const baselineSeqRef = useRef<number>(-1)

  useEffect(() => {
    if (!query.data) return
    setLiveCandles(gapFillCandles(query.data, interval))
    // Re-baseline: everything the tape already knows about as of THIS fetch
    // is presumed captured by the fresh candles we just received.
    baselineSeqRef.current = useTapeStore.getState().trades[0]?.seq ?? -1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, interval])

  useEffect(() => {
    return useTapeStore.subscribe((state) => {
      const newest = state.trades[0]
      if (!newest || newest.seq <= baselineSeqRef.current) return
      baselineSeqRef.current = newest.seq
      setLiveCandles((prev) => applyLiveTrade(prev, newest, interval))
    })
  }, [interval])

  return {
    candles: liveCandles,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
