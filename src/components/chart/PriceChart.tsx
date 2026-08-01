// Candlestick chart + volume histogram, themed off styles/theme.css so it
// reads as part of this app rather than a default lightweight-charts widget
// dropped onto a dark page.
//
// Interval state can be owned here (uncontrolled, renders its own tabs) or
// lifted by the caller (controlled, tabs suppressed) so the trade route can
// put them in the Panel header — DESIGN.md's wireframe has them on the
// "CHART" rule, and rendering a second header row inside the body both
// duplicates the chrome and steals ~32px from the plot.
//
// lightweight-charts v5 API: series are created with `chart.addSeries(<Def>,
// options)` (v4's `chart.addCandlestickSeries()` etc. is gone), where <Def>
// is a value import (`CandlestickSeries`, `HistogramSeries`) rather than a
// string.

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { PAIR } from '../../config'
import type { CandleInterval } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import type { Candle } from '../../lib/types'
import { useCandles } from '../../state/useCandles'
import { IntervalTabs } from './IntervalTabs'

export const DEFAULT_INTERVAL: CandleInterval = '15m'

/** Framing the chart on load follows the most recent RUN of activity.
 *
 * `fitContent()` alone frames the whole series, and useCandles synthesizes a
 * flat candle for every quiet bucket between real trades — so on `1s` a market
 * that last traded 25 minutes ago hands the chart ~1,500 buckets of which
 * maybe 40 carry a trade. Framing all of them squeezes every real candle into
 * a few pixels at the right edge.
 *
 * A fixed bucket count doesn't fix it, and neither does anchoring on the Nth
 * most recent trade: this market trades in bursts separated by long silences
 * (measured on the running engine — a 21-trade burst over 40 seconds, then a
 * 99-minute gap, then an older burst). Any fixed N reaches back across a gap
 * and drags in dead time.
 *
 * So the left edge is the start of the current burst: walk back until we cross
 * more than QUIET_RUN consecutive empty buckets, which is the boundary between
 * "this session" and the last one. MIN/MAX keep a three-trade burst from
 * rendering as three billboards and a dense series from framing everything. */
const QUIET_RUN = 30
const MIN_FRAMED_BARS = 60
const MAX_FRAMED_BARS = 240

/** Index to start the visible range at, per the rule above. */
function frameStartIndex(candles: Candle[]): number {
  let i = candles.length - 1
  let quiet = 0
  for (; i >= 0; i--) {
    if (candles[i].volume > 0) quiet = 0
    else if (++quiet > QUIET_RUN) break
  }
  // The loop consumed `quiet` filler buckets past the burst; step back over
  // them so the window starts at the burst, not inside the silence before it.
  const burstStart = i + quiet

  let from = burstStart - 3 // a little breathing room on the left
  from = Math.min(from, candles.length - MIN_FRAMED_BARS)
  from = Math.max(from, candles.length - MAX_FRAMED_BARS)
  return Math.max(0, from)
}

/** Reads a design token straight off the document so the chart (an
 * off-DOM canvas widget with its own imperative theming API) stays in sync
 * with styles/theme.css instead of hardcoding hex values here. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** A bucket only exists in the API response because a trade happened in it,
 * so `volume === 0` with a flat OHLC is the exact signature of a candle
 * useCandles synthesized to fill a quiet gap. Those are drawn in --ink-3
 * rather than bid/ask green: a flat doji painted in a trade colour claims
 * activity that never happened, and at 1s the filler outnumbers the real
 * candles enough to bury them. */
function isFiller(c: Candle): boolean {
  return c.volume === 0 && c.high === c.low && c.open === c.close
}

function toCandlestickData(candles: Candle[], filler: string): CandlestickData[] {
  return candles.map((c) => {
    const base = { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }
    return isFiller(c) ? { ...base, color: filler, wickColor: filler, borderColor: filler } : base
  })
}

function toVolumeData(candles: Candle[], upColor: string, downColor: string): HistogramData[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? upColor : downColor,
  }))
}

export interface PriceChartProps {
  /** Controlled interval — when supplied, the caller also owns the tabs and
   * this component renders none. Omit to let the chart own both. */
  interval?: CandleInterval
}

export function PriceChart({ interval: controlledInterval }: PriceChartProps = {}) {
  const [uncontrolledInterval, setUncontrolledInterval] = useState<CandleInterval>(DEFAULT_INTERVAL)
  const isControlled = controlledInterval !== undefined
  const interval = controlledInterval ?? uncontrolledInterval
  const { candles, isLoading, isError, error } = useCandles(interval)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  // Whether the visible range still needs framing for the current interval.
  // Set on every interval switch, cleared by the first fit that has data —
  // so we frame the series exactly once per interval and then leave the
  // viewport alone, because refitting on every live tick would yank the
  // chart out from under anyone who has panned or zoomed.
  const needsFitRef = useRef(true)

  // Create the chart once. Themed entirely from CSS custom properties so it
  // never drifts from styles/theme.css.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const panelBg = cssVar('--color-panel', '#10141b')
    const hairline = cssVar('--color-hairline', '#212836')
    const hairline2 = cssVar('--color-hairline-2', '#2c3546')
    const ink2 = cssVar('--color-ink-2', '#93a0b4')
    const ink3 = cssVar('--color-ink-3', '#5c6879')
    const bid = cssVar('--color-bid', '#22c58b')
    const ask = cssVar('--color-ask', '#f1616f')
    const mono = cssVar('--font-mono', 'monospace')

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: panelBg },
        textColor: ink2,
        fontFamily: mono,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: hairline },
        horzLines: { color: hairline },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: hairline2, labelBackgroundColor: cssVar('--color-panel-2', '#161b24') },
        horzLine: { color: hairline2, labelBackgroundColor: cssVar('--color-panel-2', '#161b24') },
      },
      rightPriceScale: {
        borderColor: hairline,
        // Headroom above and a reserved band below, so candles never collide
        // with the volume histogram sharing the pane.
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: hairline,
        timeVisible: true,
        // Breathing room at the right edge so the newest candle isn't jammed
        // against the price axis.
        rightOffset: 3,
        minBarSpacing: 0.5,
        // fitContent divides the pane by the bar count, so a market with
        // four buckets of history would otherwise render four candles the
        // width of billboards. This caps how wide a bar can get; the series
        // simply stops short of the left edge instead.
        maxBarSpacing: 56,
      },
      localization: {
        // Prices are whole u64 units — thousands separators, never a decimal.
        priceFormatter: (p: number) => fmtInt(Math.round(p)),
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: bid,
      downColor: ask,
      borderVisible: false,
      wickUpColor: bid,
      wickDownColor: ask,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })

    // Volume as a squashed overlay in the bottom ~22% of the pane, on its own
    // (invisible) price scale so it doesn't fight the candle axis.
    // lastValueVisible/priceLineVisible must both be off: the price scale is
    // hidden, but the series' last-value badge and price line are drawn on
    // the *visible* right axis regardless, where a raw volume figure lands on
    // top of the price gridline labels.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: ink3,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    // The chart sits in a flex/grid cell that changes size at breakpoints —
    // watch the container directly rather than relying on window resize.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) chart.resize(width, height)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  // Push data whenever the (gap-filled, live-extended) candle series changes.
  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    if (!chart || !candleSeries || !volumeSeries) return

    candleSeries.setData(toCandlestickData(candles, cssVar('--color-ink-3', '#5c6879')))
    volumeSeries.setData(
      toVolumeData(candles, cssVar('--color-bid-vol', 'rgba(34,197,139,.45)'), cssVar('--color-ask-vol', 'rgba(241,97,111,.45)')),
    )

    // Without framing, the series renders at the default bar spacing pinned
    // to the right edge, so a short series occupies a sliver of the pane and
    // the rest is empty grid. With unbounded framing, a long gap-filled
    // series has the opposite problem (see FRAMED_BARS).
    if (needsFitRef.current && candles.length > 0) {
      const timeScale = chart.timeScale()
      const from = frameStartIndex(candles)
      if (from > 0) {
        // `to` overshoots the last index to reproduce the right-edge margin
        // `rightOffset` gives fitContent — setVisibleLogicalRange overrides it.
        timeScale.setVisibleLogicalRange({ from, to: candles.length + 2 })
      } else {
        timeScale.fitContent()
      }
      needsFitRef.current = false
    }
  }, [candles])

  // Seconds only matter (and only fit) on the 1s tab.
  useEffect(() => {
    needsFitRef.current = true
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: true, secondsVisible: interval === '1s' },
    })
  }, [interval])

  const showEmpty = !isLoading && !isError && candles.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {!isControlled && <IntervalTabs value={interval} onChange={setUncontrolledInterval} />}
      <div className="relative min-h-0 flex-1">
        {/* isolate: lightweight-charts renders its canvases with an explicit
            z-index internally. Without a stacking context boundary here,
            that z-index leaks past this div and paints over the sibling
            loading/error/empty overlays below — which sit at z-index:auto —
            regardless of DOM order. `isolation: isolate` scopes it. */}
        <div ref={containerRef} className="absolute inset-0 isolate" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel">
            <p className="text-ui-body text-ink-2">Loading chart…</p>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-panel px-4 text-center">
            <p className="text-ui-body text-ink">Couldn't load the chart.</p>
            <p className="text-ui-body text-ink-2">
              {error instanceof Error ? error.message : 'Check your connection and try again.'}
            </p>
          </div>
        )}

        {showEmpty && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel px-4 text-center">
            <p className="text-ui-body text-ink-2">No trades yet for {PAIR}. The chart fills in as trades happen.</p>
          </div>
        )}
      </div>
    </div>
  )
}
