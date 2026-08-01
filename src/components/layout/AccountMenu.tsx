// Account menu in the header. Exists because there was previously no sign-out
// path anywhere in the app — the only way out of a session was to let the
// token expire.
//
// Dropdowns are one of the two things DESIGN.md allows to float (the other is
// toasts), so this is the one place a shadow is used. Closes on outside click,
// on Escape, and on focus leaving the menu entirely.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export interface AccountMenuProps {
  accountId: number | null
  onSignOut: () => void
}

export function AccountMenu({ accountId, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="relative"
      // Focus leaving the whole menu (tabbing past the last item) closes it,
      // so keyboard users aren't left with an invisible open panel.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-input px-2 text-ui-body text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <span className="num text-num-form">Account {accountId ?? '—'}</span>
        <span aria-hidden="true" className={`text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-40 overflow-hidden rounded-panel border border-hairline-2 bg-panel shadow-lg shadow-black/40"
        >
          <Link
            to="/wallet"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-ui-body text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            Wallet
          </Link>
          <Link
            to="/admin"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-ui-body text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            Admin
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="block w-full border-t border-hairline px-3 py-2 text-left text-ui-body text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
