// Test deposit — a dev affordance, labelled as one (DESIGN.md). A real
// exchange credits deposits from an observed chain/bank event, never a
// client call.

import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { DEPOSIT_CAPS } from '../../config'
import { ApiError, deposit } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import type { Currency } from '../../lib/types'
import { BALANCES_QUERY_KEY, getBalance, useBalances } from '../../state/useBalances'
import { toast } from '../layout/Toasts'
import { IntegerInput } from '../trade/IntegerInput'

const CURRENCIES: Currency[] = ['USD', 'SOL']

export function DepositForm() {
  const queryClient = useQueryClient()
  const balances = useBalances()
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [submitting, setSubmitting] = useState(false)

  // Deposit ceiling caps the *holding* (available + reserved), not the
  // request (API.md § Abuse guards) — headroom under that ceiling, not the
  // raw cap, is the number worth showing before submit. `held` comes from
  // the same GET /balances read useBalances always serves, which lags the
  // matching engine by a few ms (useBalances.ts) — so this can be stale in
  // either direction by whatever landed in that gap.
  const held = getBalance(balances.data, currency)
  const cap = DEPOSIT_CAPS[currency]
  const headroom = cap - (held.available + held.reserved)
  const atCeiling = headroom <= 0
  const exceedsHeadroom = !!amount && amount > 0 && amount > headroom

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!amount || amount <= 0) {
      toast('Enter an amount.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const result = await deposit(amount, currency)
      queryClient.setQueryData<{ currency: Currency; available: number; reserved: number }[]>(BALANCES_QUERY_KEY, (prev) => {
        if (!prev) return prev
        return prev.map((b) => (b.currency === currency ? { ...b, available: result.available } : b))
      })
      void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY })
      toast(`Deposited ${fmtInt(amount)} ${currency}.`, 'success')
      setAmount(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast('That deposit may have already gone through — refreshing your balances.', 'info')
        void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY })
      } else if (err instanceof ApiError && err.reason === 'DepositLimitExceeded') {
        // The cap is on available + reserved *after* the deposit lands, not
        // on the request itself (API.md § Abuse guards) — so unlike
        // InsufficientFunds, just resubmitting the same amount can never
        // succeed. Name the ceiling and the only thing that actually frees
        // room: trade the balance away or withdraw, then top back up.
        toast(
          `Accounts may hold at most ${fmtInt(cap)} ${currency} (available + reserved). This deposit would put you at or over that — retrying won't help. Trade some ${currency} away or withdraw, then deposit again.`,
          'error',
        )
      } else if (err instanceof ApiError) {
        toast(err.message, 'error')
      } else {
        toast('Something went wrong making the deposit.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // h-full + mt-auto on the button: the two wallet cards have different
    // amounts of body copy, and without this their primary buttons land on
    // different lines.
    <form onSubmit={handleSubmit} className="flex h-full w-full flex-col gap-3">
      <p className="text-ui-body text-ink-2">
        Test deposit — a production exchange credits from an observed chain or bank event.
      </p>
      <div className="flex gap-2">
        <IntegerInput
          value={amount}
          onChange={setAmount}
          placeholder="Amount"
          disabled={submitting}
          aria-label="Deposit amount"
          className="flex-1"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          disabled={submitting}
          aria-label="Deposit currency"
          className="field select-field num h-9 text-num-form"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Pre-submit awareness of the deposit ceiling (API.md § Abuse guards),
          so most users never see the 400 at all. Deliberately advisory, not
          gating: `held` is read off the same lagging GET /balances
          projection as everywhere else in the wallet (useBalances.ts), so a
          trade that just freed up room, or one that just used it, may not be
          reflected yet. Disabling the button on this number risks refusing a
          deposit the server would actually accept — worse than letting a
          truly-over-cap one round-trip into the explicit 400 branch above,
          which already says exactly what to do. So this warns and gets out
          of the way; it never disables submit. */}
      {atCeiling ? (
        <p className="text-ui-body text-ink-3">
          You're at the {fmtInt(cap)} {currency} holding cap (available + reserved). Trade some {currency} away or withdraw before
          depositing more.
        </p>
      ) : exceedsHeadroom ? (
        <p role="alert" className="text-ui-body text-ask">
          That would push your holding past the {fmtInt(cap)} {currency} cap. The most you can deposit right now is{' '}
          {fmtInt(headroom)} {currency}.
        </p>
      ) : (
        <p className="text-ui-body text-ink-3">
          Room for {fmtInt(headroom)} more {currency} before the {fmtInt(cap)} {currency} holding cap (available + reserved).
        </p>
      )}

      <button type="submit" disabled={submitting} aria-busy={submitting} className="btn btn-primary mt-auto h-btn-primary">
        {submitting ? 'Depositing…' : 'Deposit'}
      </button>
    </form>
  )
}
