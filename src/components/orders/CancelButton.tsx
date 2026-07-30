// Inline cancel action for one order row. DESIGN.md: "Cancel is inline and
// optimistic" — the actual optimistic-update/revert/reconcile logic lives in
// useOrders (it owns the shared query cache); this component only tracks its
// own in-flight state so a slow tap can't fire the request twice.

import { useState } from 'react'

export interface CancelButtonProps {
  orderId: number
  onCancel: (orderId: number) => Promise<void>
}

export function CancelButton({ orderId, onCancel }: CancelButtonProps) {
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    if (pending) return
    setPending(true)
    try {
      await onCancel(orderId)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={`Cancel order #${orderId}`}
      className="rounded-chip border border-hairline-2 px-2 py-0.5 text-ui-body text-ink-2 transition-colors hover:border-ask hover:text-ask disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Cancelling…' : 'Cancel'}
    </button>
  )
}
