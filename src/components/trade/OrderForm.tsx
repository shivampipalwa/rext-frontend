// Limit/Market x Buy/Sell order entry. Renders content only — no <Panel>
// wrapper, the trade route supplies that (and reuses this component in its
// own OrderEntryContent slot).
//
// Signed out, this is replaced with a sign-in prompt: the trade screen is
// public and read-only when logged out (DESIGN.md).

import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PAIR, BASE_CCY, QUOTE_CCY } from '../../config'
import { ApiError, placeOrder } from '../../lib/api'
import { fmtAvgPrice, fmtInt } from '../../lib/format'
import type { Currency, OrderType, PlacedOrder, Side } from '../../lib/types'
import { useAuth } from '../../state/useAuth'
import { getBalance, useBalances } from '../../state/useBalances'
import { useOrderFormStore } from '../../state/useOrderFormStore'
import { toast } from '../layout/Toasts'
import { IntegerInput } from './IntegerInput'
import { ReservePreview } from './ReservePreview'
import { SideToggle } from './SideToggle'

const ORDER_TYPES: OrderType[] = ['Limit', 'Market']

export function OrderForm() {
  const { isAuthenticated } = useAuth()
  const balances = useBalances()
  const prefillPrice = useOrderFormStore((s) => s.price)
  const prefillSize = useOrderFormStore((s) => s.size)
  const prefillNonce = useOrderFormStore((s) => s.prefillNonce)

  const [orderType, setOrderType] = useState<OrderType>('Limit')
  const [side, setSide] = useState<Side>('Bid')
  const [price, setPrice] = useState<number | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Keyed off the nonce, not the price value — selecting the same price
  // twice from the order book is a real user action that must still re-fill
  // the form (useOrderFormStore.ts).
  useEffect(() => {
    if (prefillNonce === 0) return
    setOrderType('Limit')
    if (prefillPrice !== null) setPrice(prefillPrice)
    if (prefillSize !== null) setSize(prefillSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce])

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-2 py-6 text-center">
        <p className="text-ui-body text-ink-2">Sign in to place orders.</p>
        <Link to="/login" className="text-ui-body text-accent">
          Sign in
        </Link>
      </div>
    )
  }

  const usd = getBalance(balances.data, 'USD')
  const sol = getBalance(balances.data, 'SOL')

  const sizeValue = size ?? 0
  const priceValue = price ?? 0

  // A Sell always reserves exactly `size` SOL, known regardless of order
  // type — the engine locks the base currency directly. A Buy reserves
  // `price * size` USD, but only for a Limit order: a Market buy's cost
  // depends on the execution price, which isn't known until the trade
  // happens, so there's nothing honest to preview (DESIGN.md's rule against
  // faking data the API doesn't give us).
  const reserveKnown = side === 'Ask' || orderType === 'Limit'
  const reserveCurrency: Currency = side === 'Ask' ? 'SOL' : 'USD'
  const reserveAmount = side === 'Ask' ? sizeValue : priceValue * sizeValue
  const reserveAvailable = reserveCurrency === 'USD' ? usd.available : sol.available
  const insufficient = reserveKnown && sizeValue > 0 && reserveAmount > reserveAvailable

  const balancesReady = !balances.isPending
  const hasSize = size !== null && size > 0
  const hasPrice = orderType === 'Limit' ? price !== null && price > 0 : true
  const canSubmit = isAuthenticated && balancesReady && hasSize && hasPrice && !(reserveKnown && insufficient) && !submitting

  function insufficientFundsMessage(currency: Currency, available: number, needed: number | null): string {
    if (needed !== null) {
      return `Not enough available ${currency}. You have ${fmtInt(available)}, this order needs ${fmtInt(needed)}.`
    }
    return `Not enough available ${currency}. You have ${fmtInt(available)}.`
  }

  function reportResult(placed: PlacedOrder, requestedSize: number) {
    const avg = fmtAvgPrice(placed.totalCost, placed.filledQty)
    const avgText = avg ? ` Avg fill ${avg} ${QUOTE_CCY} (derived).` : ''

    if (placed.filledQty === 0) {
      toast(`Order resting: ${fmtInt(requestedSize)} ${BASE_CCY} at your limit price.`, 'success')
      return
    }
    if (placed.filledQty < requestedSize) {
      if (orderType === 'Market') {
        // A market order that couldn't fully fill is cancelled, never
        // rested (API.md) — say so plainly rather than implying it's open.
        toast(
          `Market order filled ${fmtInt(placed.filledQty)} of ${fmtInt(requestedSize)} ${BASE_CCY} and was cancelled — not enough liquidity for the rest.${avgText}`,
          'info',
        )
        return
      }
      toast(
        `Order partially filled: ${fmtInt(placed.filledQty)} of ${fmtInt(requestedSize)} ${BASE_CCY}.${avgText} Remainder resting.`,
        'success',
      )
      return
    }
    toast(`Order filled: ${fmtInt(placed.filledQty)} ${BASE_CCY}.${avgText}`, 'success')
  }

  function reportError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        // The command already landed — never re-send. Reconcile via a
        // balances refetch rather than trusting local state.
        toast('That order may have already gone through — refreshing your balances.', 'info')
        void balances.refetch()
        return
      }
      if (err.reason === 'InsufficientFunds') {
        toast(insufficientFundsMessage(reserveCurrency, reserveAvailable, reserveKnown ? reserveAmount : null), 'error')
        return
      }
      if (err.reason === 'InvalidPair') {
        toast(`${PAIR} isn't listed for trading yet.`, 'error')
        return
      }
      if (err.reason === 'InvalidAmount') {
        toast('Price × size is too large.', 'error')
        return
      }
      toast(err.message, 'error')
      return
    }
    toast('Something went wrong placing the order.', 'error')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!hasSize) {
      toast('Enter a size.', 'error')
      return
    }
    if (!hasPrice) {
      toast('Enter a price.', 'error')
      return
    }
    if (reserveKnown && insufficient) return

    const submittedPrice = orderType === 'Market' ? 0 : priceValue
    const requestedSize = sizeValue

    setSubmitting(true)
    try {
      const placed = await placeOrder({ pair: PAIR, side, orderType, price: submittedPrice, size: requestedSize })
      balances.applyOrderEffect({ side, orderType, price: submittedPrice, size: requestedSize, placed })
      reportResult(placed, requestedSize)
      setPrice(null)
      setSize(null)
    } catch (err) {
      reportError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const submitLabel = side === 'Bid' ? `Buy ${BASE_CCY}` : `Sell ${BASE_CCY}`

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Order type" className="flex gap-1">
          {ORDER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={orderType === t}
              onClick={() => setOrderType(t)}
              className={`h-8 rounded-input px-3 text-ui-body transition-colors ${
                orderType === t ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <SideToggle value={side} onChange={setSide} />
      </div>

      {orderType === 'Limit' && (
        <label className="flex flex-col gap-1">
          <span className="text-panel-label">Price</span>
          <div className="flex items-center gap-2">
            <IntegerInput value={price} onChange={setPrice} placeholder="0" aria-label="Price" className="flex-1" />
            <span className="text-num-form num text-ink-2">{QUOTE_CCY}</span>
          </div>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-panel-label">Size</span>
        <div className="flex items-center gap-2">
          <IntegerInput value={size} onChange={setSize} placeholder="0" aria-label="Size" className="flex-1" />
          <span className="text-num-form num text-ink-2">{BASE_CCY}</span>
        </div>
      </label>

      {reserveKnown ? (
        <ReservePreview amount={reserveAmount} available={reserveAvailable} currency={reserveCurrency} insufficient={insufficient} />
      ) : (
        <p className="text-ui-body text-ink-2">
          Market buy cost depends on the execution price — available {fmtInt(usd.available)} {QUOTE_CCY}. Not previewed in advance.
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        aria-busy={submitting}
        className={`h-btn-primary rounded-input border text-ui-body transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          side === 'Bid' ? 'border-bid bg-bid-wash text-bid' : 'border-ask bg-ask-wash text-ask'
        }`}
      >
        {submitLabel}
      </button>
    </form>
  )
}
