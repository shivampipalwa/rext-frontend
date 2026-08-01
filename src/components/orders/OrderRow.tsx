// One row of the orders table: id, type, side, price × size, filled
// progress, time, cancel. Integers only (`fmtInt`) — never `.toFixed()` on a
// price or size, per DESIGN.md. Side is shown as Buy/Sell with an explicit
// ▲/▼ marker (DESIGN.md's copy rule reserves raw Bid/Ask for the order book's
// own column headers, and colour is never the only signal).

import { fmtInt, fmtTime } from '../../lib/format'
import type { OrderStatus } from '../../lib/types'
import type { OrderRow as OrderRowData } from '../../state/useOrders'
import { CancelButton } from './CancelButton'

const STATUS_LABEL: Record<OrderStatus, string> = {
  open: 'Open',
  partially_filled: 'Partial',
  filled: 'Filled',
  cancelled: 'Cancelled',
}

const CANCELLABLE: readonly OrderStatus[] = ['open', 'partially_filled']

export interface OrderRowProps {
  order: OrderRowData
  onCancel: (orderId: number) => Promise<void>
  /** The table drops the Time column entirely when no visible row has a
   * timestamp — `GET /orders` doesn't return one. */
  showTime?: boolean
}

export function OrderRow({ order, onCancel, showTime = true }: OrderRowProps) {
  const isBid = order.side === 'Bid'
  const filledPct = order.size > 0 ? Math.min(100, (order.filledQty / order.size) * 100) : 0
  // Solid, not the 10% wash: a wash fill on a --hairline-2 track is
  // indistinguishable from the empty track at 1px tall.
  const barColor = order.status === 'cancelled' ? 'bg-ink-3' : isBid ? 'bg-bid' : 'bg-ask'
  const sideColor = isBid ? 'text-bid' : 'text-ask'
  const remaining = Math.max(0, order.size - order.filledQty)

  return (
    <tr className="h-row-orders border-b border-hairline last:border-b-0">
      <td className="px-2 text-num-table num text-ink-2">#{fmtInt(order.orderId)}</td>
      <td className="px-2 text-ui-body text-ink-2">{order.orderType}</td>
      <td className={`px-2 text-ui-body ${sideColor}`} aria-hidden="false">
        <span aria-hidden="true">{isBid ? '▲' : '▼'}</span> {isBid ? 'Buy' : 'Sell'}
      </td>
      <td className="px-2 text-num-table num text-ink">
        {fmtInt(order.price)} × {fmtInt(order.size)}
      </td>
      {/* Status is its own column: it was previously printed inside the
          "Filled" cell, so a row read "Filled: Open 0/10" — the status word
          sitting under a header that names a different quantity. */}
      <td className="px-2 text-ui-body text-ink-2">{STATUS_LABEL[order.status]}</td>
      <td className="px-2">
        <div className="flex items-center gap-2" title={`${fmtInt(remaining)} remaining`}>
          <span className="text-num-table num text-ink-2">
            {fmtInt(order.filledQty)}/{fmtInt(order.size)}
          </span>
          <span className="relative h-1 w-12 shrink-0 overflow-hidden rounded-chip bg-hairline-2" aria-hidden="true">
            <span className={`absolute inset-y-0 left-0 ${barColor}`} style={{ width: `${filledPct}%` }} />
          </span>
        </div>
      </td>
      {showTime && (
        <td className="px-2 text-num-table num text-ink-3">{order.receivedAt !== null ? fmtTime(order.receivedAt) : '—'}</td>
      )}
      <td className="px-2 text-right">{CANCELLABLE.includes(order.status) && <CancelButton orderId={order.orderId} onCancel={onCancel} />}</td>
    </tr>
  )
}
