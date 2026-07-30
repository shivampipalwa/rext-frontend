// Withdraw draws only from `available` — funds held against open orders are
// untouchable until those orders are cancelled (DESIGN.md). We check against
// available client-side so the user learns before the round trip, and repeat
// the same explanation if the server rejects it anyway with InsufficientFunds.

import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { ApiError, withdraw } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import type { Currency } from '../../lib/types'
import { getBalance, useBalances, BALANCES_QUERY_KEY } from '../../state/useBalances'
import { toast } from '../layout/Toasts'
import { IntegerInput } from '../trade/IntegerInput'

const CURRENCIES: Currency[] = ['USD', 'SOL']

const HELD_EXPLANATION =
  "Funds held against open orders can't be withdrawn until those orders are cancelled."

export function WithdrawForm() {
  const queryClient = useQueryClient()
  const balances = useBalances()
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [submitting, setSubmitting] = useState(false)

  const available = getBalance(balances.data, currency).available
  const exceedsAvailable = amount !== null && amount > available

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!amount || amount <= 0) {
      toast('Enter an amount.', 'error')
      return
    }
    if (exceedsAvailable) return

    setSubmitting(true)
    try {
      await withdraw(amount, currency)
      queryClient.setQueryData<{ currency: Currency; available: number; reserved: number }[]>(BALANCES_QUERY_KEY, (prev) => {
        if (!prev) return prev
        return prev.map((b) => (b.currency === currency ? { ...b, available: b.available - amount } : b))
      })
      void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY })
      toast(`Withdrew ${fmtInt(amount)} ${currency}.`, 'success')
      setAmount(null)
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'InsufficientFunds') {
        toast(`Not enough available ${currency} to withdraw ${fmtInt(amount)}. ${HELD_EXPLANATION}`, 'error')
      } else if (err instanceof ApiError && err.status === 409) {
        toast('That withdrawal may have already gone through — refreshing your balances.', 'info')
        void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY })
      } else if (err instanceof ApiError) {
        toast(err.message, 'error')
      } else {
        toast('Something went wrong making the withdrawal.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <p className="text-ui-body text-ink-2">Draws only from available balance — held funds stay locked.</p>
      <div className="flex gap-2">
        <IntegerInput
          value={amount}
          onChange={setAmount}
          placeholder="Amount"
          disabled={submitting}
          aria-label="Withdrawal amount"
          aria-invalid={exceedsAvailable}
          className="flex-1"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          disabled={submitting}
          aria-label="Withdrawal currency"
          className="h-9 rounded-input border border-hairline bg-panel-2 px-2 text-num-form num text-ink disabled:opacity-50"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <p className="text-ui-body text-ink-2">
        Available: <span className="text-num-form num text-ink">{fmtInt(available)}</span> {currency}
      </p>
      {exceedsAvailable && (
        <p role="alert" className="text-ui-body text-ask">
          Not enough available {currency}. You have {fmtInt(available)}, this withdrawal needs {fmtInt(amount ?? 0)}. {HELD_EXPLANATION}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || exceedsAvailable}
        aria-busy={submitting}
        className="h-9 rounded-input border border-accent text-ui-body text-ink transition-colors hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Withdraw
      </button>
    </form>
  )
}
