// The card primitive. Every feature panel (order book, chart, trades,
// wallet, orders table, ...) is built on this: 1px hairline border, 8px
// radius, uppercase 11px/600 tracked label header. Depth comes from rules,
// not shadows — panels never float.

import type { ReactNode } from 'react'

export interface PanelProps {
  label: string
  children?: ReactNode
  /** Rendered on the right of the label — interval tabs, tab switchers, a
   * count badge, etc. */
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  /** Keeps the label for screen readers but drops it visually, handing the
   * header row to `actions`. For tabbed panels, where the active tab's chip
   * already names the content — "TRADES  [Trades][Wallet]" said it twice. */
  labelHidden?: boolean
  /** Forwarded to the root element. Feature panels that are genuinely
   * tabular data (e.g. the order book) should override this to "table". */
  role?: string
}

export function Panel({ label, children, actions, className = '', bodyClassName = '', labelHidden = false, role }: PanelProps) {
  return (
    <section role={role} className={`flex flex-col overflow-hidden rounded-panel border border-hairline bg-panel ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <h2 className={labelHidden ? 'sr-only' : 'text-panel-label'}>{label}</h2>
        {/* With the label hidden the actions take the whole row, so tabs sit
            at the left edge where a panel title would have been. */}
        {actions && <div className={labelHidden ? 'flex-1' : ''}>{actions}</div>}
      </header>
      <div className={`min-h-0 flex-1 p-3 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
