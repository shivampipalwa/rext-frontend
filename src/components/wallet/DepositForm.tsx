// Test deposit — a dev affordance, labelled as one (DESIGN.md). A real
// exchange credits deposits from an observed chain/bank event, never a
// client call.

import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { ApiError, deposit } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import type { Currency } from '../../lib/types'
import { BALANCES_QUERY_KEY } from '../../state/useBalances'
import { toast } from '../layout/Toasts'
import { IntegerInput } from '../trade/IntegerInput'

const CURRENCIES: Currency[] = ['USD', 'SOL']

export function DepositForm() {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [submitting, setSubmitting] = useState(false)

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
          className="h-9 rounded-input border border-hairline bg-panel-2 px-2 text-num-form num text-ink disabled:opacity-50"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="h-9 rounded-input border border-accent text-ui-body text-ink transition-colors hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Deposit
      </button>
    </form>
  )
}
