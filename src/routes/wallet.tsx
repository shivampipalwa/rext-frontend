// Wallet — balances table plus deposit/withdraw, per DESIGN.md's "Wallet"
// wireframe.

import { Link } from 'react-router-dom'
import { BASE_CCY, QUOTE_CCY } from '../config'
import { Panel } from '../components/layout/Panel'
import { BalanceTable } from '../components/wallet/BalanceTable'
import { DepositForm } from '../components/wallet/DepositForm'
import { WithdrawForm } from '../components/wallet/WithdrawForm'
import { useAuth } from '../state/useAuth'
import { useBalances } from '../state/useBalances'

export default function WalletRoute() {
  const { isAuthenticated } = useAuth()
  const balances = useBalances()

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-ui-body text-ink-2">Sign in to view your wallet.</p>
          <Link to="/login" className="btn btn-primary h-9">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    // Capped and centred. Full-bleed, a two-row balances table spread its
    // four columns across the whole viewport, so Currency and Total sat at
    // opposite edges of the screen and read as unrelated facts.
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-heading">Wallet</h1>
          <p className="text-ui-body text-ink-2">
            Balances for {QUOTE_CCY} and {BASE_CCY}. Amounts are whole units — this market has no decimals.
          </p>
        </div>

        <Panel label="Balances">
          {balances.isPending ? (
            <p className="text-ui-body text-ink-2">Loading balances…</p>
          ) : balances.isError ? (
            <p className="text-ui-body text-ask">Couldn't load balances. Try again.</p>
          ) : (
            <BalanceTable balances={balances.data ?? []} />
          )}
        </Panel>

        {/* items-stretch (the grid default) plus `h-full` on each form makes
            the two cards the same height and lands their buttons on the same
            line, instead of Deposit ending 40px short of Withdraw. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel label="Deposit" bodyClassName="flex">
            <DepositForm />
          </Panel>
          <Panel label="Withdraw" bodyClassName="flex">
            <WithdrawForm />
          </Panel>
        </div>
      </div>
    </div>
  )
}
