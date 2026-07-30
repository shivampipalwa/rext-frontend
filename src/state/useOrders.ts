// Orders — React Query snapshot (`GET /orders`) merged with the private
// order-updates socket. This hook OWNS the `ordersSocket` lifecycle: it
// connects whenever we're authenticated and disconnects on logout or
// unmount. See lib/ws/ordersSocket.ts for the socket's exact contract before
// touching this file.
//
// Merge model: the REST snapshot seeds the React Query cache under
// `['orders', accountId]`; every socket message patches that same cache
// directly via `queryClient.setQueryData`, so components reading the query
// see one always-current list without a second merge step.
//
//   - `OrderAccepted` prepends a fresh resting order (skipped if we already
//     have it — the REST snapshot may have raced the socket handshake).
//   - `OrderUpdated` patches `status` and `filledQty` in place. `filledQty`
//     is CUMULATIVE on this feed — we set it, never accumulate onto it.
//   - Cancellation is just an `OrderUpdated` with `status: 'cancelled'`;
//     there's no separate message to handle.
//
// This feed carries no sequence number, so reconciliation is best-effort:
// `onNeedsResync` (fired on every successful (re)connect, including the
// first) invalidates the query instead of trusting the merge, per API.md and
// DESIGN.md's "Private feed" section.
//
// Cross-agent contract: on every private-feed message we dispatch a `window`
// CustomEvent named `orders:changed`. The balances hook (owned by another
// agent) listens for it — balances move whenever an order is accepted, fills,
// or cancels, and there is no push feed for balances themselves.

import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from '../components/layout/Toasts'
import { ApiError, cancelOrder as apiCancelOrder, getOrders } from '../lib/api'
import type { Order, OrderStatus } from '../lib/types'
import { ordersSocket, type OrdersSocketHandlers } from '../lib/ws/ordersSocket'
import { useAuth } from './useAuth'

function ordersQueryKey(accountId: number | null) {
  return ['orders', accountId] as const
}

/** An order plus a client-observed receive time. `GET /orders` returns no
 * timestamp field at all — there is nothing honest to show for a row loaded
 * from the REST snapshot, so `receivedAt` is `null` there. An order accepted
 * over the socket during this session gets a real client timestamp recorded
 * off the `OrderAccepted` event, similar to how the tape stamps trades with
 * client receive time (see lib/types.ts's `Trade.ts`). */
export interface OrderRow extends Order {
  receivedAt: number | null
}

export interface UseOrdersResult {
  orders: OrderRow[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  /** Optimistic, inline cancel. Marks the row cancelled immediately; on an
   * ambiguous failure (404/409/504) it refetches instead of guessing, and on
   * any other failure it reverts the optimistic change. Always resolves —
   * failures are reported via `toast`, never thrown to the caller. */
  cancelOrder: (orderId: number) => Promise<void>
}

export function useOrders(): UseOrdersResult {
  const { isAuthenticated, token, accountId } = useAuth()
  const queryClient = useQueryClient()
  // Persists across renders and across socket reconnects/resyncs, but is
  // naturally scoped to this hook instance's lifetime — a fresh page load
  // has no client-observed times yet, which is correct (we didn't witness
  // any accept this session).
  const receivedAtRef = useRef<Map<number, number>>(new Map())

  const queryKey = useMemo(() => ordersQueryKey(accountId), [accountId])

  const query = useQuery({
    queryKey,
    queryFn: getOrders,
    enabled: isAuthenticated,
  })

  useEffect(() => {
    if (!isAuthenticated || !token) {
      ordersSocket.disconnect()
      return
    }

    const handlers: OrdersSocketHandlers = {
      onOrderAccepted: (order) => {
        receivedAtRef.current.set(order.orderId, Date.now())
        queryClient.setQueryData<Order[]>(queryKey, (prev) => {
          if (!prev) return [order]
          if (prev.some((o) => o.orderId === order.orderId)) return prev
          return [order, ...prev]
        })
        window.dispatchEvent(new CustomEvent('orders:changed'))
      },
      onOrderUpdated: (update) => {
        queryClient.setQueryData<Order[]>(queryKey, (prev) => {
          if (!prev) return prev
          return prev.map((o) =>
            o.orderId === update.orderId ? { ...o, filledQty: update.filledQty, status: update.status } : o,
          )
        })
        window.dispatchEvent(new CustomEvent('orders:changed'))
      },
      onNeedsResync: () => {
        void queryClient.invalidateQueries({ queryKey })
      },
    }

    ordersSocket.connect(token, handlers)
    return () => ordersSocket.disconnect()
  }, [isAuthenticated, token, queryClient, queryKey])

  const cancelOrder = useCallback(
    async (orderId: number) => {
      const previous = queryClient.getQueryData<Order[]>(queryKey)
      // Optimistic: mark cancelled now rather than waiting on the round
      // trip. Marking (not removing) keeps History honest immediately too.
      queryClient.setQueryData<Order[]>(queryKey, (prev) =>
        prev?.map((o) => (o.orderId === orderId ? { ...o, status: 'cancelled' as OrderStatus } : o)) ?? prev,
      )

      try {
        await apiCancelOrder(orderId)
        toast('Order cancelled', 'success')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // Doesn't exist or isn't ours — API.md says these are deliberately
          // indistinguishable, so we don't claim which. Usually means it
          // already filled or was already cancelled by the time we asked.
          toast("That order is no longer cancellable — it likely already filled or was already cancelled.", 'error')
          void queryClient.invalidateQueries({ queryKey })
          return
        }
        if (err instanceof ApiError && err.status === 409) {
          // Duplicate X-Client-Order-Id — the command already landed.
          // Never retry; refetch and reconcile instead.
          toast('That cancel already went through — refreshing order status.', 'info')
          void queryClient.invalidateQueries({ queryKey })
          return
        }
        if (err instanceof ApiError && err.status === 504) {
          // api.ts already retried this twice; still ambiguous.
          toast("Cancel timed out — it may or may not have gone through. Checking the latest status.", 'error')
          void queryClient.invalidateQueries({ queryKey })
          return
        }
        // Unambiguous failure (network error, 500, etc.) — revert.
        if (previous) queryClient.setQueryData(queryKey, previous)
        const message = err instanceof ApiError ? err.message : 'Could not cancel the order. Try again.'
        toast(message, 'error')
      }
    },
    [queryClient, queryKey],
  )

  const orders = useMemo<OrderRow[]>(
    () => (query.data ?? []).map((o) => ({ ...o, receivedAt: receivedAtRef.current.get(o.orderId) ?? null })),
    [query.data],
  )

  return {
    orders,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    cancelOrder,
  }
}
