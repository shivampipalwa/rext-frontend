// Orders table — two tabs over the ONE dataset `GET /orders` returns (no
// pagination/filtering server-side), split client-side per DESIGN.md:
//   Open    = status `open` + `partially_filled`
//   History = everything, capped at HISTORY_RENDER_CAP rendered rows, with an
//             honest note when more exist.
//
// Renders content only — no <Panel> wrapper. The route supplies that.
// Signed out, this shows a sign-in prompt rather than an error: the trade
// screen is public and read-only when logged out.

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HISTORY_RENDER_CAP } from '../../config'
import { fmtInt } from '../../lib/format'
import type { OrderStatus } from '../../lib/types'
import { useAuth } from '../../state/useAuth'
import { useOrders } from '../../state/useOrders'
import { OrderRow } from './OrderRow'

type Tab = 'open' | 'history'

const OPEN_STATUSES: readonly OrderStatus[] = ['open', 'partially_filled']

function byNewestFirst<T extends { orderId: number }>(a: T, b: T): number {
  return b.orderId - a.orderId
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-chip px-2 py-1 text-ui-body transition-colors ${
        active ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function OrdersTable() {
  const { isAuthenticated } = useAuth()
  const [tab, setTab] = useState<Tab>('open')
  const { orders, isLoading, isError, refetch, cancelOrder } = useOrders()

  const openOrders = useMemo(() => orders.filter((o) => OPEN_STATUSES.includes(o.status)).sort(byNewestFirst), [orders])
  const history = useMemo(() => [...orders].sort(byNewestFirst), [orders])
  const visibleHistory = useMemo(() => history.slice(0, HISTORY_RENDER_CAP), [history])
  const hiddenCount = history.length - visibleHistory.length

  if (!isAuthenticated) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
        <p className="text-ui-body text-ink-2">Sign in to view and manage your orders.</p>
        <Link to="/login" className="text-ui-body text-accent">
          Sign in
        </Link>
      </div>
    )
  }

  const rows = tab === 'open' ? openOrders : visibleHistory

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center gap-1">
        <TabButton active={tab === 'open'} onClick={() => setTab('open')}>
          {`Open orders (${openOrders.length})`}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          Order history
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <p className="p-3 text-ui-body text-ink-2">Loading orders…</p>
        ) : isError ? (
          <div className="flex flex-col items-start gap-2 p-3">
            <p className="text-ui-body text-ink-2">Couldn't load your orders.</p>
            <button type="button" onClick={refetch} className="text-ui-body text-accent">
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-3 text-ui-body text-ink-2">
            {tab === 'open'
              ? 'No open orders. Place one from the order form.'
              : 'No orders yet. Your history will appear here once you trade.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-row-orders border-b border-hairline">
                <th scope="col" className="px-2 text-panel-label font-normal">
                  ID
                </th>
                <th scope="col" className="px-2 text-panel-label font-normal">
                  Type
                </th>
                <th scope="col" className="px-2 text-panel-label font-normal">
                  Side
                </th>
                <th scope="col" className="px-2 text-panel-label font-normal">
                  Price × size
                </th>
                <th scope="col" className="px-2 text-panel-label font-normal">
                  Filled
                </th>
                <th scope="col" className="px-2 text-panel-label font-normal">
                  Time
                </th>
                <th scope="col" className="px-2 text-panel-label font-normal">
                  <span className="sr-only">Cancel</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <OrderRow key={order.orderId} order={order} onCancel={cancelOrder} />
              ))}
            </tbody>
          </table>
        )}
        {tab === 'history' && hiddenCount > 0 && (
          <p className="px-2 py-2 text-ui-body text-ink-3">
            Showing the most recent {fmtInt(visibleHistory.length)} of {fmtInt(history.length)} orders.
          </p>
        )}
      </div>
    </div>
  )
}
