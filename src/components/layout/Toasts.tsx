// Toast host + the `toast()` helper. No provider/context needed to call
// `toast()` — it's a module-level pub/sub so it works from anywhere,
// including plain async functions outside a component (e.g. an optimistic
// cancel that reverts and reports failure). Mount <Toasts /> once, near the
// app root.

import { useEffect, useState } from 'react'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastMessage {
  id: number
  text: string
  variant: ToastVariant
}

type Listener = (toasts: ToastMessage[]) => void

let toasts: ToastMessage[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener(toasts)
}

const DEFAULT_DURATION_MS = 4000

/** Fire-and-forget. Buttons name what happens, and so do their toasts:
 * `toast('Order cancelled')`, `toast('Not enough available USD', 'error')`. */
export function toast(text: string, variant: ToastVariant = 'info', durationMs = DEFAULT_DURATION_MS): void {
  const id = nextId++
  toasts = [...toasts, { id, text, variant }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, durationMs)
}

function useToasts(): ToastMessage[] {
  const [state, setState] = useState<ToastMessage[]>(toasts)
  useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  info: 'border-hairline-2',
  success: 'border-bid',
  error: 'border-ask',
}

export function Toasts() {
  const items = useToasts()
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto rounded-input border bg-panel-2 px-3 py-2 text-ui-body text-ink shadow-lg ${VARIANT_BORDER[item.variant]}`}
        >
          {item.text}
        </div>
      ))}
    </div>
  )
}
