// Orders table — two tabs over the ONE dataset `GET /orders` returns (no
// pagination/filtering server-side), split client-side per DESIGN.md:
//   Open    = status `open` + `partially_filled`
//   History = everything, capped at HISTORY_RENDER_CAP rendered rows, with an
//             honest note when more exist.
//
// Renders content only — no <Panel> wrapper. The route supplies that.
// Signed out, this shows a sign-in prompt rather than an error: the trade
// screen is public and read-only when logged out.
//
// The Open tab also carries a warning banner when the account rests orders on
// both sides of the book at once — the state that makes the API reject every
// subsequent order as `"SelfTrade"` with no visible cause. See `hasBothSides`
// below.

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

  // Resting orders on both sides at once is the exact state that makes the
  // API reject `"SelfTrade"` on the account's *next* order, outright and
  // with no partial fill first — there's no gradual warning, just a sudden
  // wall of 400s once a crossing Limit order has rested on the far side.
  // `useOpenOrders` exists precisely so other components can see this without
  // opening a second private socket (see useOpenOrders.ts), but this
  // component already holds the live list via `useOrders`, so deriving it
  // from `openOrders` here keeps one source of truth instead of two.
  const hasBothSides = openOrders.some((o) => o.side === 'Bid') && openOrders.some((o) => o.side === 'Ask')

  if (!isAuthenticated) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
        <p className="text-ui-body text-ink-2">Sign in to view and manage your orders.</p>
        <Link to="/login" className="btn btn-primary h-9">
          Sign in
        </Link>
      </div>
    )
  }

  const rows = tab === 'open' ? openOrders : visibleHistory

  // `GET /orders` carries no timestamp — only orders observed live on the
  // private socket have one. Rendering the column regardless meant every row
  // loaded from REST showed a dash, i.e. a column that could never hold
  // information for the rows most often on screen. Show it only when at
  // least one visible row can fill it.
  const showTime = rows.some((o) => o.receivedAt !== null)

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

      {/* `shrink-0`, same as the tab row above, and deliberately OUTSIDE the
          `overflow-auto` body below: this is the one sentence on the whole
          screen that names why orders are about to start failing, so it must
          stay pinned above the fold rather than scroll off with row 1. It
          eats into the scrollable area instead of growing the panel — this
          panel's height is fixed by the route (see trade.tsx's HEIGHT MODEL
          comment), so a taller note here means less visible table, never a
          taller panel. */}
      {tab === 'open' && hasBothSides && (
        <p
          role="status"
          className="shrink-0 rounded-input border border-warn/40 bg-panel-2 px-3 py-2 text-ui-body text-warn"
        >
          You hold resting orders on both sides of the book. New orders will be rejected as self-trades until you
          cancel one side.
        </p>
      )}

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
          // table-fixed with explicit widths: with `auto` the browser
          // redistributes slack across all seven columns, which on a
          // full-width panel left a ~900px hole in the middle of every row.
          // Fixed widths cluster the data left; the unsized cancel column
          // absorbs the remainder and stays pinned right.
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="h-row-orders border-b border-hairline">
                <th scope="col" className="w-16 px-2 text-panel-label font-normal">
                  ID
                </th>
                <th scope="col" className="w-20 px-2 text-panel-label font-normal">
                  Type
                </th>
                <th scope="col" className="w-24 px-2 text-panel-label font-normal">
                  Side
                </th>
                <th scope="col" className="w-40 px-2 text-panel-label font-normal">
                  Price × size
                </th>
                <th scope="col" className="w-28 px-2 text-panel-label font-normal">
                  Status
                </th>
                <th scope="col" className="w-40 px-2 text-panel-label font-normal">
                  Filled
                </th>
                {showTime && (
                  <th scope="col" className="w-24 px-2 text-panel-label font-normal">
                    Time
                  </th>
                )}
                <th scope="col" className="px-2 text-panel-label font-normal">
                  <span className="sr-only">Cancel</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <OrderRow key={order.orderId} order={order} onCancel={cancelOrder} showTime={showTime} />
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
