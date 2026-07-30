// Candlestick chart + volume histogram, themed off styles/theme.css so it
// reads as part of this app rather than a default lightweight-charts widget
// dropped onto a dark page. Manages its own interval state and renders
// IntervalTabs itself — the route only supplies the surrounding <Panel>.
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
import type { Candle } from '../../lib/types'
import { useCandles } from '../../state/useCandles'
import { IntervalTabs } from './IntervalTabs'

const DEFAULT_INTERVAL: CandleInterval = '15m'

/** Reads a design token straight off the document so the chart (an
 * off-DOM canvas widget with its own imperative theming API) stays in sync
 * with styles/theme.css instead of hardcoding hex values here. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function toCandlestickData(candles: Candle[]): CandlestickData[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))
}

function toVolumeData(candles: Candle[], upColor: string, downColor: string): HistogramData[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? upColor : downColor,
  }))
}

export function PriceChart() {
  const [interval, setChartInterval] = useState<CandleInterval>(DEFAULT_INTERVAL)
  const { candles, isLoading, isError, error } = useCandles(interval)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Create the chart once. Themed entirely from CSS custom properties so it
  // never drifts from styles/theme.css.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const panelBg = cssVar('--color-panel', '#10141b')
    const hairline = cssVar('--color-hairline', '#212836')
    const ink2 = cssVar('--color-ink-2', '#93a0b4')
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
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: hairline },
      timeScale: { borderColor: hairline, timeVisible: true },
    })

    // Prices are whole u64 units — never render a decimal on the axis.
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: bid,
      downColor: ask,
      borderVisible: false,
      wickUpColor: bid,
      wickDownColor: ask,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })

    // Volume as a squashed overlay in the bottom ~20% of the pane, its own
    // (invisible) price scale so it doesn't fight the candle axis.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: ink2,
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
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    if (!candleSeries || !volumeSeries) return
    const bidWash = cssVar('--color-bid-wash', 'rgba(34, 197, 139, 0.1)')
    const askWash = cssVar('--color-ask-wash', 'rgba(241, 97, 111, 0.1)')
    candleSeries.setData(toCandlestickData(candles))
    volumeSeries.setData(toVolumeData(candles, bidWash, askWash))
  }, [candles])

  // Seconds only matter (and only fit) on the 1s tab.
  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: true, secondsVisible: interval === '1s' },
    })
  }, [interval])

  const showEmpty = !isLoading && !isError && candles.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <IntervalTabs value={interval} onChange={setChartInterval} />
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />

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
