// The trade screen — full responsive grid from DESIGN.md's wireframe and
// breakpoint table. Every region is a <Panel> with a one-line placeholder;
// later agents drop real components into these exact slots (book/, chart/,
// trade/, tape/, orders/, wallet/ per DESIGN.md's component tree).
//
// Breakpoints (matching Tailwind's default md/lg/xl exactly):
//   >=1280 (xl)      three columns: book | chart+entry | trades+wallet.
//                    Orders table spans full width below.
//   1024-1279 (lg)   same three columns, but trades+wallet collapse into one
//                    tabbed panel.
//   768-1023 (md)    two columns: chart+entry | book+trades tabbed.
//                    Orders table stays full width below.
//   <768             single column, bottom tab bar: Chart · Book · Trade ·
//                    Orders. Order entry becomes the full-screen "Trade" tab
//                    (a later agent can promote this to a true sheet/overlay
//                    — the slot and tab wiring are already correct).
//
// Tier is resolved in JS (not pure CSS) because the *grouping* of panels
// genuinely changes shape across breakpoints (which panels share one tabbed
// unit), not just their position — that can't be expressed as a single DOM
// tree restyled by media queries. Each tier renders exactly one instance of
// each panel, so there is one canonical slot per region regardless of
// viewport width.

import { useEffect, useState, type ReactNode } from 'react'
import { OrderBook } from '../components/book/OrderBook'
import { PriceChart } from '../components/chart/PriceChart'
import { Panel } from '../components/layout/Panel'
import { OrdersTable } from '../components/orders/OrdersTable'
import { TradeTape } from '../components/tape/TradeTape'
import { OrderForm } from '../components/trade/OrderForm'
import { BalanceTable } from '../components/wallet/BalanceTable'
import { Link } from 'react-router-dom'
import { useAuth } from '../state/useAuth'
import { useBalances } from '../state/useBalances'

type Tier = 'mobile' | 'tablet' | 'desktopNarrow' | 'desktop'

function tierFor(width: number): Tier {
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  if (width < 1280) return 'desktopNarrow'
  return 'desktop'
}

function useTier(): Tier {
  const [tier, setTier] = useState<Tier>(() => tierFor(window.innerWidth))
  useEffect(() => {
    const onResize = () => setTier(tierFor(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return tier
}

// ---------------------------------------------------------------------------
// Region content. THIS IS THE ONLY PLACE EACH REGION IS DEFINED — every tier
// below, including the tabbed collapses, renders these same components, so a
// region is wired once and appears correctly at all four breakpoints.
// ---------------------------------------------------------------------------

const BookContent = OrderBook
const ChartContent = PriceChart
const OrderEntryContent = OrderForm
const TradesContent = TradeTape
const OrdersContent = OrdersTable

/** BalanceTable is presentational and takes balances as a prop (the wallet
 * route already has them in hand). On the trade screen nothing else needs
 * them, so this thin wrapper owns the fetch and the not-signed-in case. */
function WalletContent() {
  const { data, isLoading } = useBalances()
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return (
      <p className="text-ui-body text-ink-2">
        <Link to="/login" className="text-accent underline underline-offset-2">
          Sign in
        </Link>{' '}
        to see your balances.
      </p>
    )
  }
  if (isLoading || !data) return <p className="text-ui-body text-ink-2">Loading balances…</p>
  return <BalanceTable balances={data} />
}

function OrderBookPanel({ className = '' }: { className?: string }) {
  return (
    <Panel label="Order book" className={className}>
      <BookContent />
    </Panel>
  )
}

function ChartPanel({ className = '' }: { className?: string }) {
  return (
    // No `actions` here: PriceChart renders its own IntervalTabs, and a
    // placeholder interval row in the Panel header would duplicate them.
    <Panel label="Chart" className={className} bodyClassName="min-h-[280px]">
      <ChartContent />
    </Panel>
  )
}

function OrderEntryPanel({ className = '' }: { className?: string }) {
  return (
    <Panel label="Order entry" className={className}>
      <OrderEntryContent />
    </Panel>
  )
}

function TradesPanel({ className = '' }: { className?: string }) {
  return (
    <Panel label="Trades" className={className}>
      <TradesContent />
    </Panel>
  )
}

function WalletPanel({ className = '' }: { className?: string }) {
  return (
    <Panel label="Wallet" className={className}>
      <WalletContent />
    </Panel>
  )
}

function OrdersTablePanel({ className = '' }: { className?: string }) {
  return (
    // No `actions` and a neutral label: OrdersTable renders its own
    // Open/History tabs (with the live open count) inside the body.
    <Panel label="Orders" className={className}>
      <OrdersContent />
    </Panel>
  )
}

interface Tab {
  key: string
  label: string
  content: ReactNode
}

/** Combines two regions into one tabbed Panel, for the breakpoints where
 * DESIGN.md calls for a collapse (e.g. trades+wallet at the lg tier). */
function TabbedPanel({ tabs, className = '' }: { tabs: [Tab, Tab]; className?: string }) {
  const [activeKey, setActiveKey] = useState(tabs[0].key)
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]
  return (
    <Panel
      label={active.label}
      className={className}
      actions={
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              aria-pressed={t.key === activeKey}
              className={`rounded-chip px-2 py-0.5 text-ui-body transition-colors ${
                t.key === activeKey ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {active.content}
    </Panel>
  )
}

const MOBILE_TABS = [
  { key: 'chart', label: 'Chart' },
  { key: 'book', label: 'Book' },
  { key: 'trade', label: 'Trade' },
  { key: 'orders', label: 'Orders' },
] as const

type MobileTabKey = (typeof MOBILE_TABS)[number]['key']

function MobileTradeLayout() {
  const [active, setActive] = useState<MobileTabKey>('chart')
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {active === 'chart' && <ChartPanel />}
        {active === 'book' && <OrderBookPanel />}
        {active === 'trade' && <OrderEntryPanel />}
        {active === 'orders' && <OrdersTablePanel />}
      </div>
      <nav className="grid shrink-0 grid-cols-4 border-t border-hairline bg-panel" aria-label="Trade screen sections">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            aria-current={active === tab.key ? 'true' : undefined}
            className={`h-11 text-ui-body transition-colors ${active === tab.key ? 'text-accent' : 'text-ink-2'}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function TabletTradeLayout() {
  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <div className="grid flex-1 grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <ChartPanel className="flex-1" />
          <OrderEntryPanel />
        </div>
        <TabbedPanel
          tabs={[
            { key: 'book', label: 'Order book', content: <BookContent /> },
            { key: 'trades', label: 'Trades', content: <TradesContent /> },
          ]}
        />
      </div>
      <OrdersTablePanel />
    </div>
  )
}

function DesktopNarrowTradeLayout() {
  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <div className="grid flex-1 grid-cols-[240px_1fr_260px] gap-2">
        <OrderBookPanel />
        <div className="flex flex-col gap-2">
          <ChartPanel className="flex-1" />
          <OrderEntryPanel />
        </div>
        <TabbedPanel
          tabs={[
            { key: 'trades', label: 'Trades', content: <TradesContent /> },
            { key: 'wallet', label: 'Wallet', content: <WalletContent /> },
          ]}
        />
      </div>
      <OrdersTablePanel />
    </div>
  )
}

function DesktopTradeLayout() {
  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <div className="grid flex-1 grid-cols-[280px_1fr_300px] gap-2">
        <OrderBookPanel />
        <div className="flex flex-col gap-2">
          <ChartPanel className="flex-1" />
          <OrderEntryPanel />
        </div>
        <div className="flex flex-col gap-2">
          <TradesPanel className="flex-1" />
          <WalletPanel />
        </div>
      </div>
      <OrdersTablePanel />
    </div>
  )
}

export default function TradeRoute() {
  const tier = useTier()
  if (tier === 'mobile') return <MobileTradeLayout />
  if (tier === 'tablet') return <TabletTradeLayout />
  if (tier === 'desktopNarrow') return <DesktopNarrowTradeLayout />
  return <DesktopTradeLayout />
}
