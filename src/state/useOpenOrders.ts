// Read-only view of the account's resting orders — the small slice of order
// state that components outside the orders table care about.
//
// It subscribes to the same React Query cache entry (`ordersQueryKey`) that
// `useOrdersFeed` patches from the private socket at the app root, so it sees
// every push update and stays exactly in sync while owning no socket, no
// fetch of its own, and no lifecycle. `useOrders` reads that same entry; the
// two differ only in what they derive from it, and both are safe to call from
// anywhere.
//
// Why anything needs this: the API rejects an order that would match your own
// resting order with `"SelfTrade"`, outright, with no partial fill. A user
// holding resting orders on both sides has every subsequent order rejected
// with no visible cause — so the order form and the trade screen's navigation
// both need to see resting orders, without either becoming a second owner of
// the feed.

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getOrders } from '../lib/api'
import type { Order, OrderStatus, Side } from '../lib/types'
import { useAuth } from './useAuth'
import { ordersQueryKey } from './useOrders'

const OPEN_STATUSES: readonly OrderStatus[] = ['open', 'partially_filled']

export interface OpenOrdersView {
  /** Every order still resting in the book (`open` or `partially_filled`). */
  open: Order[]
  count: number
  /** True when at least one resting order sits on this side of the book. An
   * incoming order on the OPPOSITE side is the one at risk of self-trading. */
  hasBid: boolean
  hasAsk: boolean
  /** Resting orders that a new order on `side` could cross into — i.e. the
   * ones that would trigger `"SelfTrade"`. */
  crossableBy: (side: Side) => Order[]
}

export function useOpenOrders(): OpenOrdersView {
  const { isAuthenticated, accountId } = useAuth()

  // Same key, same queryFn as useOrders: React Query dedupes the fetch and
  // shares one cache entry. This never mounts a socket.
  const query = useQuery({
    queryKey: ordersQueryKey(accountId),
    queryFn: getOrders,
    enabled: isAuthenticated,
  })

  return useMemo(() => {
    const open = (query.data ?? []).filter((o) => OPEN_STATUSES.includes(o.status))
    return {
      open,
      count: open.length,
      hasBid: open.some((o) => o.side === 'Bid'),
      hasAsk: open.some((o) => o.side === 'Ask'),
      // A new Bid crosses resting Asks; a new Ask crosses resting Bids.
      crossableBy: (side: Side) => open.filter((o) => o.side !== side),
    }
  }, [query.data])
}
