// Wallet — balances table plus deposit/withdraw, per DESIGN.md's "Wallet"
// wireframe.

import { Link } from 'react-router-dom'
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
          <Link to="/login" className="text-ui-body text-accent">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <h1 className="text-page-heading">Wallet</h1>

      <Panel label="Balances">
        {balances.isPending ? (
          <p className="text-ui-body text-ink-2">Loading balances…</p>
        ) : balances.isError ? (
          <p className="text-ui-body text-ask">Couldn't load balances. Try again.</p>
        ) : (
          <BalanceTable balances={balances.data ?? []} />
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel label="Deposit">
          <DepositForm />
        </Panel>
        <Panel label="Withdraw">
          <WithdrawForm />
        </Panel>
      </div>
    </div>
  )
}
