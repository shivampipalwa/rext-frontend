// Socket connection indicator. Colour is never the only signal — every state
// carries an explicit text label too.

import type { ConnState } from '../../lib/types'

const CONN_CONFIG: Record<ConnState, { dot: string; label: string }> = {
  connecting: { dot: 'bg-warn', label: 'Connecting' },
  live: { dot: 'bg-bid', label: 'Live' },
  reconnecting: { dot: 'bg-warn', label: 'Reconnecting' },
  closed: { dot: 'bg-ask', label: 'Disconnected' },
}

export function StatusDot({ state }: { state: ConnState }) {
  const { dot, label } = CONN_CONFIG[state]
  return (
    <span className="inline-flex items-center gap-1.5 text-ui-body text-ink-2">
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
