// React Query over `GET /balances`. Two API facts drive everything here:
//
// 1. A currency the account has never touched is ABSENT from the response,
//    not zero — we always surface both USD and SOL, defaulting a missing one
//    to zero (see `withDefaults`).
// 2. `GET /balances` reads a Postgres projection that lags the matching
//    engine by a few milliseconds. The `POST /orders` response is
//    authoritative for the order just placed (DESIGN.md "Source of truth"),
//    so callers apply it immediately via `applyOrderEffect` — and this hook
//    guards that optimistic value against being clobbered by a refetch that
//    resolves before the projection has caught up (see `reconcile`).
//
// Balances move on every fill, and there's no push feed for them, so another
// agent's `useOrders` hook dispatches a `window` CustomEvent named
// `orders:changed` on every private-WebSocket message. We refetch on that,
// debounced 300ms.

import { useQueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { getBalances } from '../lib/api'
import type { Balance, Currency, OrderType, PlacedOrder, Side } from '../lib/types'
import { useAuth } from './useAuth'

export const BALANCES_QUERY_KEY = ['balances'] as const

const ALL_CURRENCIES: readonly Currency[] = ['USD', 'SOL']

function zeroBalance(currency: Currency): Balance {
  return { currency, available: 0, reserved: 0 }
}

/** Always returns both USD and SOL — an untouched currency defaults to zero
 * rather than being absent, per API.md. */
function withDefaults(balances: readonly Balance[]): Balance[] {
  const byCurrency = new Map(balances.map((b) => [b.currency, b]))
  return ALL_CURRENCIES.map((c) => byCurrency.get(c) ?? zeroBalance(c))
}

export function getBalance(balances: readonly Balance[] | undefined, currency: Currency): Balance {
  return balances?.find((b) => b.currency === currency) ?? zeroBalance(currency)
}

// ---- Optimistic-patch guard against a stale (lagging) read -----------------
//
// Module-level, not per-hook-instance, so it's shared across every component
// that mounts `useBalances()` — mirrors the pub/sub pattern in Toasts.tsx.

interface PendingPatch {
  /** The value we had immediately before applying the optimistic patch. If a
   * refetch comes back matching this exactly, the projection hasn't caught
   * up yet — it's a stale read and we keep the optimistic value instead. */
  baseline: Balance
  optimistic: Balance
  appliedAt: number
}

const OPTIMISTIC_GRACE_MS = 2000

const pendingPatches = new Map<Currency, PendingPatch>()

function reconcile(fresh: readonly Balance[]): Balance[] {
  const now = Date.now()
  return fresh.map((b) => {
    const pending = pendingPatches.get(b.currency)
    if (!pending) return b
    if (now - pending.appliedAt > OPTIMISTIC_GRACE_MS) {
      pendingPatches.delete(b.currency)
      return b
    }
    const looksStale = b.available === pending.baseline.available && b.reserved === pending.baseline.reserved
    if (looksStale) return pending.optimistic
    // The projection has moved past the baseline — trust it, it caught up.
    pendingPatches.delete(b.currency)
    return b
  })
}

async function fetchBalances(): Promise<Balance[]> {
  const raw = await getBalances()
  return reconcile(withDefaults(raw))
}

// ---- Order-effect math ------------------------------------------------------
//
// The POST /orders response tells us exactly what happened; we don't need to
// wait for a lagging GET /balances to reflect it. This computes the resulting
// balance as a final-state delta rather than modelling the engine's
// intermediate reserve-then-release mechanics (which include automatic price-
// improvement refunds we can't observe from the client):
//
// Buy (Bid):  USD available -= totalCost + (rests ? price * remaining : 0)
//             USD reserved  += rests ? price * remaining : 0
//             SOL available += filledQty
// Sell (Ask): SOL available -= filledQty + (rests ? remaining : 0)
//             SOL reserved  += rests ? remaining : 0
//             USD available += totalCost
//
// "Rests" only applies to Limit orders with a nonzero remainder — a Market
// order that can't fully fill is cancelled, never rested (API.md), so its
// remainder is never reserved.

export interface OrderEffectInput {
  side: Side
  orderType: OrderType
  /** The price actually submitted (0 for Market). */
  price: number
  size: number
  placed: PlacedOrder
}

function computeOrderEffect(before: readonly Balance[], input: OrderEffectInput): Balance[] {
  const { side, orderType, price, size, placed } = input
  const remaining = Math.max(0, size - placed.filledQty)
  const rests = orderType === 'Limit' && remaining > 0

  const usd = getBalance(before, 'USD')
  const sol = getBalance(before, 'SOL')

  if (side === 'Bid') {
    const usdLocked = rests ? price * remaining : 0
    const nextUsd: Balance = {
      currency: 'USD',
      available: Math.max(0, usd.available - placed.totalCost - usdLocked),
      reserved: Math.max(0, usd.reserved + usdLocked),
    }
    const nextSol: Balance = { currency: 'SOL', available: sol.available + placed.filledQty, reserved: sol.reserved }
    return [nextUsd, nextSol]
  }

  const solLocked = rests ? remaining : 0
  const nextSol: Balance = {
    currency: 'SOL',
    available: Math.max(0, sol.available - placed.filledQty - solLocked),
    reserved: Math.max(0, sol.reserved + solLocked),
  }
  const nextUsd: Balance = { currency: 'USD', available: usd.available + placed.totalCost, reserved: usd.reserved }
  return [nextUsd, nextSol]
}

export type UseBalancesResult = UseQueryResult<Balance[], Error> & {
  /** Apply a just-placed order's effect immediately (authoritative), instead
   * of waiting on the lagging REST projection. Guarded against being
   * clobbered by a stale refetch for `OPTIMISTIC_GRACE_MS`. */
  applyOrderEffect: (input: OrderEffectInput) => void
}

export function useBalances(): UseBalancesResult {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: BALANCES_QUERY_KEY,
    queryFn: fetchBalances,
    enabled: isAuthenticated,
  })

  // Refetch whenever an order event lands, debounced 300ms — balances move on
  // every fill and there's no push feed for them (DESIGN.md).
  const debounceRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isAuthenticated) return
    const handleOrdersChanged = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null
        void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY })
      }, 300)
    }
    window.addEventListener('orders:changed', handleOrdersChanged)
    return () => {
      window.removeEventListener('orders:changed', handleOrdersChanged)
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [isAuthenticated, queryClient])

  const applyOrderEffect = (input: OrderEffectInput) => {
    const before = withDefaults(queryClient.getQueryData<Balance[]>(BALANCES_QUERY_KEY) ?? [])
    const after = computeOrderEffect(before, input)
    const now = Date.now()
    for (const optimistic of after) {
      const baseline = getBalance(before, optimistic.currency)
      if (baseline.available === optimistic.available && baseline.reserved === optimistic.reserved) continue
      pendingPatches.set(optimistic.currency, { baseline, optimistic, appliedAt: now })
    }
    queryClient.setQueryData<Balance[]>(BALANCES_QUERY_KEY, after)
  }

  return { ...query, applyOrderEffect }
}
