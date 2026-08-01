// Interval switcher for the price chart. The `1w` tab carries a title
// (tooltip) calling out the one honest quirk we don't paper over: weekly
// buckets are floor(unix_time / interval) like every other interval, but
// since the Unix epoch fell on a Thursday, `1w` buckets start on Thursday
// rather than Monday. See API.md's `GET /candles/:pair` section and
// DESIGN.md's "Chart" paragraph.

import type { CandleInterval } from '../../lib/api'

interface IntervalDef {
  key: CandleInterval
  label: string
  title?: string
}

const INTERVALS: IntervalDef[] = [
  { key: '1s', label: '1s' },
  { key: '15m', label: '15m' },
  { key: '1h', label: '1h' },
  { key: '4h', label: '4h' },
  { key: '1d', label: '1d' },
  {
    key: '1w',
    label: '1w',
    title: 'Weekly buckets start Thursday, not Monday — bucketing is floor(time / interval), and the Unix epoch was a Thursday.',
  },
]

export interface IntervalTabsProps {
  value: CandleInterval
  onChange: (interval: CandleInterval) => void
}

export function IntervalTabs({ value, onChange }: IntervalTabsProps) {
  return (
    <div className="flex shrink-0 gap-1" role="tablist" aria-label="Chart interval">
      {INTERVALS.map((i) => {
        const active = value === i.key
        return (
          <button
            key={i.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={i.title}
            onClick={() => onChange(i.key)}
            className={`num h-6 rounded-chip px-2 text-[12px] transition-colors ${
              active ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:bg-panel-2/60 hover:text-ink'
            } ${i.title ? 'decoration-ink-3 underline-offset-4 hover:underline hover:decoration-dotted' : ''}`}
          >
            {i.label}
          </button>
        )
      })}
    </div>
  )
}
