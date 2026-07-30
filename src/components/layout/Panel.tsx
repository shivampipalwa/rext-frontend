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
  /** Forwarded to the root element. Feature panels that are genuinely
   * tabular data (e.g. the order book) should override this to "table". */
  role?: string
}

export function Panel({ label, children, actions, className = '', bodyClassName = '', role }: PanelProps) {
  return (
    <section role={role} className={`flex flex-col overflow-hidden rounded-panel border border-hairline bg-panel ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <h2 className="text-panel-label">{label}</h2>
        {actions}
      </header>
      <div className={`min-h-0 flex-1 p-3 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
