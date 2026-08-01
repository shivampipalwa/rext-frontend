// Limit/Market x Buy/Sell order entry. Renders content only — no <Panel>
// wrapper, the trade route supplies that (and reuses this component in its
// own OrderEntryContent slot).
//
// Signed out, this is replaced with a sign-in prompt: the trade screen is
// public and read-only when logged out (DESIGN.md).

import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PAIR, BASE_CCY, QUOTE_CCY, PRICE_BAND_PCT } from '../../config'
import { ApiError, placeOrder } from '../../lib/api'
import { fmtAvgPrice, fmtInt } from '../../lib/format'
import type { Currency, OrderType, PlacedOrder, Side } from '../../lib/types'
import { useAuth } from '../../state/useAuth'
import { getBalance, useBalances } from '../../state/useBalances'
import { useMarketStats } from '../../state/useMarketStats'
import { useOpenOrders } from '../../state/useOpenOrders'
import { useOrderFormStore } from '../../state/useOrderFormStore'
import { toast } from '../layout/Toasts'
import { IntegerInput } from './IntegerInput'
import { ReservePreview } from './ReservePreview'
import { SideToggle } from './SideToggle'

const ORDER_TYPES: OrderType[] = ['Limit', 'Market']

export function OrderForm() {
  const { isAuthenticated } = useAuth()
  const balances = useBalances()
  const { lastPrice } = useMarketStats()
  const openOrders = useOpenOrders()
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
        <Link to="/login" className="btn btn-primary h-9">
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

  // The band is ±PRICE_BAND_PCT of `reference`, which is itself a fractional
  // fraction of a whole number and so isn't a whole number either (e.g. last
  // price 73 -> [58.4, 87.6]). We only ever show the user a whole price, and
  // it must be one the engine actually accepts, so the edges are rounded
  // INWARD — ceil the low edge, floor the high edge — never outward. Rounding
  // outward would print a boundary the server still rejects. This narrows the
  // true band by at most 1 unit on each side, which is the price of giving
  // a number instead of a formula.
  function bandBounds(reference: number): { min: number; max: number } {
    return {
      min: Math.ceil(reference * (1 - PRICE_BAND_PCT)),
      max: Math.floor(reference * (1 + PRICE_BAND_PCT)),
    }
  }

  function priceOutOfBandMessage(): string {
    const pct = PRICE_BAND_PCT * 100
    // lastPrice is our best available proxy for the engine's reference price
    // (useMarketStats.ts), not the reference price itself — it can lag a
    // trade that just landed. So this names a range as our best estimate,
    // not a promise (DESIGN.md: don't fake certainty the API doesn't give
    // us). When we don't have a lastPrice at all, state the rule only.
    if (lastPrice !== null) {
      const { min, max } = bandBounds(lastPrice)
      return `Limit price must be within ±${pct}% of the last traded price (${fmtInt(lastPrice)} ${QUOTE_CCY}). Try somewhere between ${fmtInt(min)} and ${fmtInt(max)} ${QUOTE_CCY}.`
    }
    return `Limit price must be within ±${pct}% of the market's last traded price. Move it closer to the current market, or place a Market order instead.`
  }

  // Pre-submit sibling of priceOutOfBandMessage: same band, phrased as a
  // heads-up before sending rather than an explanation after a 400. Only
  // fires for Limit (Market has no band) and only once we have a lastPrice
  // to check against — a never-traded pair has no band to warn about.
  function priceBandWarningText(): string | null {
    if (orderType !== 'Limit' || lastPrice === null || price === null || price <= 0) return null
    const lower = lastPrice * (1 - PRICE_BAND_PCT)
    const upper = lastPrice * (1 + PRICE_BAND_PCT)
    if (priceValue >= lower && priceValue <= upper) return null
    const { min, max } = bandBounds(lastPrice)
    return `Outside the ±${PRICE_BAND_PCT * 100}% band around the last trade (${fmtInt(lastPrice)} ${QUOTE_CCY}) — likely to be rejected. Try ${fmtInt(min)}–${fmtInt(max)} ${QUOTE_CCY}.`
  }

  // The resting orders that the order about to go out (current side/type/
  // price) would cross, and so get rejected as a self-trade (API_new.md).
  // A Market order takes the best opposite price unconditionally, so ANY
  // resting order on the other side is crossable by it. A Limit order only
  // crosses resting orders priced at or through it.
  function crossingOwnOrders(): ReturnType<typeof openOrders.crossableBy> {
    const opposite = openOrders.crossableBy(side)
    if (opposite.length === 0) return []
    if (orderType === 'Market') return opposite
    if (!hasPrice) return []
    return opposite.filter((o) => (side === 'Bid' ? o.price <= priceValue : o.price >= priceValue))
  }

  // `tense: 'would'` is the pre-submit warning (order not sent yet);
  // `tense: 'did'` reports back an order the server already rejected.
  function selfTradeMessage(tense: 'would' | 'did'): string {
    const restingSide = side === 'Bid' ? 'sell' : 'buy'
    const clause =
      tense === 'would'
        ? `would cross your own resting ${restingSide} order and would be rejected`
        : `crossed your own resting ${restingSide} order and was rejected`
    const escape =
      orderType === 'Market'
        ? 'Cancel it in Open orders below, then retry.'
        : 'Cancel it in Open orders below, or place a Market order to take instead of resting.'
    return `This order ${clause} as a self-trade — the engine won't match you against yourself. ${escape}`
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
      if (err.reason === 'PriceOutOfBand') {
        toast(priceOutOfBandMessage(), 'error')
        return
      }
      if (err.reason === 'SelfTrade') {
        toast(selfTradeMessage('did'), 'error')
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

  // Say which field is missing instead of leaving a dimmed button with no
  // explanation. Insufficient funds is deliberately excluded — ReservePreview
  // already states that case with both numbers, and repeating it here would
  // put the same error on screen twice.
  const blockedReason = !hasSize ? 'Enter a size to continue.' : !hasPrice ? 'Enter a price to continue.' : null

  // Advisory pre-submit hints, not gates — canSubmit does NOT depend on
  // either of these. The server is the sole authority on both rules (a
  // PriceOutOfBand or SelfTrade branch in reportError above always exists),
  // so a stale lastPrice or a resting-order list one socket tick behind must
  // never be the only thing standing between the user and a rejection.
  const priceBandWarning = priceBandWarningText()
  const selfTradeWarning = crossingOwnOrders().length > 0 ? selfTradeMessage('would') : null

  return (
    // Capped and centred: the order-entry panel sits under the chart and is
    // as wide as it, and a 3-digit integer field stretched to 1100px reads as
    // a layout mistake. At the narrower tiers the cap simply doesn't bind.
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-[620px] flex-col gap-3">
      {/* Buy/Sell first and full width: it decides the direction of the whole
          form, and it used to render as two ~40px chips squeezed into the
          right end of the order-type row — the smallest control on screen
          for the largest decision on it. */}
      <SideToggle value={side} onChange={setSide} />

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

      {/* Price and size side by side: they're two halves of one quantity
          ("how much, at what"), and stacking them makes the panel tall enough
          to eat the chart's share of the column. Market orders drop to a
          single full-width size field. */}
      <div className={`grid gap-3 ${orderType === 'Limit' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {orderType === 'Limit' && (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-panel-label">Price</span>
            <div className="flex items-center gap-2">
              <IntegerInput value={price} onChange={setPrice} placeholder="0" aria-label="Price" className="min-w-0 flex-1" />
              <span className="text-num-form num text-ink-2">{QUOTE_CCY}</span>
            </div>
          </label>
        )}

        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-panel-label">Size</span>
          <div className="flex items-center gap-2">
            <IntegerInput value={size} onChange={setSize} placeholder="0" aria-label="Size" className="min-w-0 flex-1" />
            <span className="text-num-form num text-ink-2">{BASE_CCY}</span>
          </div>
        </label>
      </div>

      {reserveKnown ? (
        <ReservePreview amount={reserveAmount} available={reserveAvailable} currency={reserveCurrency} insufficient={insufficient} />
      ) : (
        <p className="text-ui-body text-ink-2">
          Market buy cost depends on the execution price — available {fmtInt(usd.available)} {QUOTE_CCY}. Not previewed in advance.
        </p>
      )}

      {/* Advisory only, same idiom as DepositForm's cap warning: never
          disables submit. The server owns both PriceOutOfBand and SelfTrade
          (reportError above), so a client check that's wrong in the
          user's favour still just round-trips into that branch — a client
          check that's wrong against them and blocks submit would be worse. */}
      {priceBandWarning && (
        <p role="alert" className="text-ui-body text-ask">
          {priceBandWarning}
        </p>
      )}
      {selfTradeWarning && (
        <p role="alert" className="text-ui-body text-ask">
          {selfTradeWarning}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {/* Solid fill, not a 10%-wash outline. This is the moment money
            moves; it should be the heaviest element in the panel, and the
            washed version read as permanently disabled. */}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={submitting}
          aria-describedby={blockedReason ? 'order-submit-hint' : undefined}
          className={`btn h-btn-primary w-full ${side === 'Bid' ? 'btn-buy' : 'btn-sell'}`}
        >
          {submitting ? 'Placing…' : submitLabel}
        </button>
        {blockedReason && (
          <p id="order-submit-hint" className="text-center text-ui-body text-ink-3">
            {blockedReason}
          </p>
        )}
      </div>
    </form>
  )
}
