// Balances table: Available / Held / Total for both currencies. Renders
// content only — no <Panel> wrapper, so it can also drop into the trade
// screen's Wallet slot (DESIGN.md wireframe).
//
// `reserved` is called "Held" here, never "reserved" — user-facing
// vocabulary, not schema vocabulary. The footnote spells out what it means
// and links to open orders, since that's the only thing that moves it.

import { Link } from 'react-router-dom'
import { fmtInt } from '../../lib/format'
import type { Balance } from '../../lib/types'

export interface BalanceTableProps {
  /** Always both USD and SOL — an untouched currency is defaulted to zero
   * upstream (useBalances), never omitted. */
  balances: Balance[]
  /** The "Held against open orders" footnote. On by default for the wallet
   * PAGE, where there's room to explain the ledger split. The trade screen's
   * wallet panel turns it off: it's a four-number glance next to the order
   * form, and two lines of prose is most of the panel. */
  showHeldNote?: boolean
}

export function BalanceTable({ balances, showHeldNote = true }: BalanceTableProps) {
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse">
        <thead>
          {/* Currency takes the slack and the three amounts get equal fixed
              widths, so they read as one comparable column group rather than
              drifting apart as the panel widens. */}
          <tr className="border-b border-hairline text-left">
            <th scope="col" className="py-2 pr-2 text-panel-label font-normal">
              Currency
            </th>
            <th scope="col" className="w-32 px-3 py-2 text-right text-panel-label font-normal">
              Available
            </th>
            <th scope="col" className="w-32 px-3 py-2 text-right text-panel-label font-normal">
              Held
            </th>
            <th scope="col" className="w-32 py-2 pl-3 text-right text-panel-label font-normal">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.currency} className="h-row-orders border-b border-hairline last:border-0">
              <td className="py-2 pr-2 text-ui-body text-ink">{b.currency}</td>
              <td className="px-3 py-2 text-right text-num-form num text-ink">{fmtInt(b.available)}</td>
              <td className="px-3 py-2 text-right text-num-form num text-ink-2">{fmtInt(b.reserved)}</td>
              <td className="py-2 pl-3 text-right text-num-form num text-ink">{fmtInt(b.available + b.reserved)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showHeldNote && (
        <p className="text-ui-body text-ink-2">
          Held against{' '}
          <Link to="/" className="text-accent">
            open orders
          </Link>{' '}
          — still your money, but locked until those orders fill or are cancelled.
        </p>
      )}
    </div>
  )
}
