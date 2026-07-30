// Admin — list/delist trading pairs. Gated server-side on ADMIN_ACCOUNT_ID,
// which the client cannot know (API.md), so this page never guesses or
// hides itself: it always renders, and a 403 from an attempted action shows
// "This account isn't the exchange admin." There's also no endpoint that
// reports which pairs are currently listed (API.md's "known rough edges"),
// so this screen can't show live listed/delisted status either — only the
// result of actions taken here.
//
// This is the bootstrap screen: on a fresh database nothing is tradeable and
// every order returns InvalidPair, so the empty state says exactly that.

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PAIR } from '../config'
import { ApiError, delistPair, listPair } from '../lib/api'
import { useAuth } from '../state/useAuth'
import { toast } from '../components/layout/Toasts'
import { Panel } from '../components/layout/Panel'

type ActionState = 'idle' | 'busy'

function normalizePair(raw: string): string {
  return raw.trim().toUpperCase()
}

export default function AdminRoute() {
  const { isAuthenticated } = useAuth()
  const [listInput, setListInput] = useState(PAIR)
  const [delistInput, setDelistInput] = useState(PAIR)
  const [listState, setListState] = useState<ActionState>('idle')
  const [delistState, setDelistState] = useState<ActionState>('idle')
  const [confirmingDelist, setConfirmingDelist] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-ui-body text-ink-2">Sign in to manage trading pairs.</p>
          <Link to="/login" className="text-ui-body text-accent">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  function handleAdminError(err: unknown, notFoundMessage: string): void {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        setForbidden(true)
        toast("This account isn't the exchange admin.", 'error')
        return
      }
      if (err.status === 404) {
        toast(notFoundMessage, 'error')
        return
      }
      if (err.reason === 'InvalidPair') {
        toast('Base and quote must be different currencies.', 'error')
        return
      }
      toast(err.message, 'error')
      return
    }
    toast('Something went wrong.', 'error')
  }

  async function handleList(e: FormEvent) {
    e.preventDefault()
    const pair = normalizePair(listInput)
    if (!pair) {
      toast('Enter a pair, e.g. SOL-USD.', 'error')
      return
    }
    setListState('busy')
    try {
      // Idempotent — listing twice also returns 204 (API.md), so there's no
      // harm in listing a pair that's already live.
      await listPair(pair)
      setForbidden(false)
      toast(`${pair} is listed for trading.`, 'success')
    } catch (err) {
      handleAdminError(err, `${pair} wasn't listed.`)
    } finally {
      setListState('idle')
    }
  }

  async function handleDelistConfirmed() {
    const pair = normalizePair(delistInput)
    setConfirmingDelist(false)
    setDelistState('busy')
    try {
      await delistPair(pair)
      setForbidden(false)
      toast(`${pair} delisted. Resting orders stay in the book and can still be cancelled.`, 'success')
    } catch (err) {
      handleAdminError(err, `${pair} wasn't listed.`)
    } finally {
      setDelistState('idle')
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <h1 className="text-page-heading">Admin</h1>

      {forbidden && (
        <div role="alert" className="rounded-panel border border-ask bg-ask-wash px-3 py-2 text-ui-body text-ask">
          This account isn't the exchange admin.
        </div>
      )}

      <p className="max-w-prose text-ui-body text-ink-2">
        No pair is tradeable until an admin lists it. On a fresh database, nothing is listed and every order fails with
        "SOL-USD isn't listed for trading yet" until it's listed here — this screen is that bootstrap step. There's no
        endpoint that reports which pairs are currently listed, so this page can't show live status, only the result of
        actions you take below.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel label="List a pair">
          <form onSubmit={handleList} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-panel-label">Pair</span>
              <input
                type="text"
                value={listInput}
                onChange={(e) => setListInput(e.target.value)}
                placeholder="SOL-USD"
                disabled={listState === 'busy'}
                aria-label="Pair to list"
                className="h-9 rounded-input border border-hairline bg-panel-2 px-2 text-num-form num uppercase text-ink placeholder:text-ink-3 disabled:opacity-50"
              />
            </label>
            <p className="text-ui-body text-ink-2">Format BASE-QUOTE, e.g. SOL-USD. Listing an already-listed pair is safe.</p>
            <button
              type="submit"
              disabled={listState === 'busy'}
              aria-busy={listState === 'busy'}
              className="h-9 rounded-input border border-bid bg-bid-wash text-ui-body text-bid transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              List pair
            </button>
          </form>
        </Panel>

        <Panel label="Delist a pair">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-panel-label">Pair</span>
              <input
                type="text"
                value={delistInput}
                onChange={(e) => setDelistInput(e.target.value)}
                placeholder="SOL-USD"
                disabled={delistState === 'busy'}
                aria-label="Pair to delist"
                className="h-9 rounded-input border border-hairline bg-panel-2 px-2 text-num-form num uppercase text-ink placeholder:text-ink-3 disabled:opacity-50"
              />
            </label>

            {!confirmingDelist ? (
              <button
                type="button"
                disabled={delistState === 'busy'}
                aria-busy={delistState === 'busy'}
                onClick={() => setConfirmingDelist(true)}
                className="h-9 rounded-input border border-ask bg-ask-wash text-ui-body text-ask transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delist pair
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirm delist" className="flex flex-col gap-2 rounded-input border border-ask bg-panel-2 p-2">
                <p className="text-ui-body text-ink">
                  Delisting {normalizePair(delistInput) || 'this pair'} blocks new orders. Resting orders already in the book
                  stay there and remain cancellable — this does not cancel or clear anything.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelistConfirmed}
                    className="h-9 flex-1 rounded-input border border-ask bg-ask-wash text-ui-body text-ask transition-colors"
                  >
                    Delist pair
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelist(false)}
                    className="h-9 flex-1 rounded-input border border-hairline text-ui-body text-ink-2 transition-colors hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
