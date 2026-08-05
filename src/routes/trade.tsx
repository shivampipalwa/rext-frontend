// The trade screen — full responsive grid from DESIGN.md's wireframe and
// breakpoint table. Every region is a <Panel> with a one-line placeholder;
// later agents drop real components into these exact slots (book/, chart/,
// trade/, tape/, orders/, wallet/ per DESIGN.md's component tree).
//
// Breakpoints (matching Tailwind's default md/lg/xl exactly):
//   >=1280 (xl)      three rails: book+trades | chart | entry+wallet.
//                    Orders table spans full width below.
//   1024-1279 (lg)   the same three rails, narrower.
//   768-1023 (md)    two columns: chart | book+trades+entry tabbed.
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
//
// HEIGHT MODEL — this screen owns one viewport, and every column ends on the
// same line.
//
// Panels whose bodies scroll internally (order book, tape, orders table)
// need a real height ceiling from somewhere, or `overflow-y-auto` never
// engages and they grow forever — the tape especially, since a live socket
// feeds it without bound. The previous version supplied that ceiling as a
// hand-picked `h-[Npx]` per panel per tier. That works, but it means the
// three columns are three unrelated stacks of fixed numbers: at 1600x1150
// signed in they ended at roughly 830px, 1100px and 890px, so the page had a
// ragged bottom edge and a large dead area under the shortest column.
//
// Instead, TRADE_SHELL below gives the whole screen one ceiling —
// `100vh - header` — and the columns divide it. Each column is a flex
// column: the panel that should absorb the slack gets `flex-1 min-h-0` and
// the content-sized ones get `shrink-0`. Because all three columns are grid
// siblings in a fixed-height row, they are all exactly as tall as the row, so
// they end level by construction at every viewport size rather than by
// coincidence at one of them. The chart now grows with the display instead of
// being capped at 480px on a 1440px-tall monitor.
//
// WHICH PANEL SITS IN WHICH RAIL is the other half of the height story, and
// it is not cosmetic. Order entry used to sit under the chart, content-sized,
// with the chart as the `flex-1` panel beneath it — so the chart was handed
// whatever the form did not want. The form is ~338px tall; the chart got the
// remaining ~263px of a ~610px row. Worse, the form's height depends on
// whether you are SIGNED IN: signed out it collapses to a ~112px sign-in
// prompt, so merely logging in silently cost the chart ~165px, nearly 40% of
// its height, with nothing in the layout aware it had happened.
//
// So the two are no longer in the same column. The chart owns the centre rail
// outright and its height is now a function of the viewport alone. Reading
// surfaces (book, tape) share the left rail; acting surfaces (order entry,
// wallet) share the right. That grouping is also why the right rail can hold
// the form at all: at 340px it is wide enough for price and size to share a
// row, which is what kept the form from simply growing taller again.
//
// `min-h-[Npx]` is the floor: below it the shell stops shrinking and the
// PAGE scrolls instead of crushing the panels. A real trading screen doesn't
// fit in 600px of height and shouldn't pretend to.
//
// The orders panel is the one panel with a FIXED height rather than a
// content-sized or flex-1 one, and that is deliberate. It briefly used
// `max-h-` so an empty table wouldn't leave dead space — but that makes its
// height a function of how many orders you have, and since the top row is
// `flex-1` the chart and book then resize every time an order is placed,
// filled or cancelled. Measured at 1680x1000: one row gave a 408px chart,
// fourteen rows gave 272px. A chart that changes height when an order fills
// is worse than a little empty space under a short table, so the number is
// fixed and the reading surfaces above it never move.
//
// `min-h-0` is still required *inside* Panel (see Panel.tsx's body div) to
// make the ceiling take effect, and on every intermediate flex wrapper here —
// without it a flex item's `min-height: auto` sizes it to content and the
// ceiling is silently ignored.

import { useEffect, useState, type ReactNode } from 'react'
import { OrderBook } from '../components/book/OrderBook'
import { IntervalTabs } from '../components/chart/IntervalTabs'
import { DEFAULT_INTERVAL, PriceChart } from '../components/chart/PriceChart'
import { Panel } from '../components/layout/Panel'
import { OrdersTable } from '../components/orders/OrdersTable'
import { TradeTape } from '../components/tape/TradeTape'
import { OrderForm } from '../components/trade/OrderForm'
import { BalanceTable } from '../components/wallet/BalanceTable'
import { Link } from 'react-router-dom'
import type { CandleInterval } from '../lib/api'
import { useAuth } from '../state/useAuth'
import { useBalances } from '../state/useBalances'
import { useOpenOrders } from '../state/useOpenOrders'

/** One viewport minus the 56px sticky header, with a floor. Every tier's
 * outer wrapper uses this, so "the columns all end together" is one decision
 * in one place rather than a per-panel pixel guess. */
const TRADE_SHELL = 'flex h-[calc(100vh-3.5rem)] flex-col gap-2 p-2'

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
  // No footnote here — see BalanceTable's `showHeldNote`. The full
  // explanation lives on /wallet.
  return <BalanceTable balances={data} showHeldNote={false} />
}

function OrderBookPanel({ className = '' }: { className?: string }) {
  return (
    <Panel label="Order book" className={className}>
      <BookContent />
    </Panel>
  )
}

/** Owns the interval so the tabs can live on the Panel's header rule, where
 * DESIGN.md's wireframe puts them ("CHART   1s 15m 1h 4h"), instead of as a
 * second header row inside the body. PriceChart's ResizeObserver picks up
 * whatever height the flex row hands this panel. */
function ChartPanel({ className = '' }: { className?: string }) {
  const [interval, setInterval] = useState<CandleInterval>(DEFAULT_INTERVAL)
  return (
    <Panel label="Chart" className={className} actions={<IntervalTabs value={interval} onChange={setInterval} />}>
      <ChartContent interval={interval} />
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
  // OrdersTable renders its own Open/History tabs (with the live open count
  // baked into the Open tab's label) inside the body, but that count is only
  // visible while the Open tab itself is selected. A user parked on History
  // gets no signal that they're also resting orders on both sides — the one
  // state that makes the API reject every new order as `"SelfTrade"` — so the
  // header carries its own copy of the count, via `actions`, which per
  // Panel's own doc comment is exactly what that slot is for ("a count
  // badge, etc."). `useOpenOrders` reads the same query-cache entry
  // `useOrders` (inside OrdersContent) already populates from the private
  // socket, so this never opens a second connection — see useOpenOrders.ts.
  const { count } = useOpenOrders()
  return (
    <Panel
      label="Orders"
      className={className}
      actions={
        count > 0 ? (
          <span
            className="rounded-chip bg-panel-2 px-2 py-0.5 text-num-table text-ink-2"
            aria-label={`${count} open order${count === 1 ? '' : 's'}`}
          >
            {count}
          </span>
        ) : undefined
      }
    >
      <OrdersContent />
    </Panel>
  )
}

interface Tab {
  key: string
  label: string
  content: ReactNode
}

/** Combines several regions into one tabbed Panel, for the breakpoints that
 * don't have enough columns to show them side by side. Takes any number of
 * tabs: the tablet tier collapses three regions (book, trades, order entry)
 * into its single right-hand column. */
function TabbedPanel({ tabs, className = '' }: { tabs: Tab[]; className?: string }) {
  const [activeKey, setActiveKey] = useState(tabs[0].key)
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]
  return (
    <Panel
      label={active.label}
      labelHidden
      className={className}
      actions={
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              aria-pressed={t.key === activeKey}
              className={`h-6 rounded-chip px-2 text-ui-body transition-colors ${
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
  // The Orders tab is the worst case on this screen for the "invisible
  // resting order" trap: it's one of four tabs behind a bottom bar, so a
  // user sitting on Chart or Trade has literally nothing on screen hinting
  // they hold anything, let alone orders on both sides about to make every
  // fill a `"SelfTrade"` 400. `useOpenOrders` is read-only against the same
  // query cache `useOrders` (owned inside the Orders tab's own OrdersTable)
  // writes, so badging the nav from here never opens a second private
  // socket — see useOpenOrders.ts.
  const { count: openCount } = useOpenOrders()
  return (
    // The tab content fills everything between the header and the tab bar
    // (100vh - 3.5rem header - 2.75rem nav). Previously it was a fixed
    // 320px panel followed by ~800px of empty canvas, which read as a
    // broken page rather than a chart.
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {active === 'chart' && <ChartPanel className="min-h-0 flex-1" />}
        {active === 'book' && <OrderBookPanel className="min-h-0 flex-1" />}
        {/* Order entry is content-sized: it must not stretch a 5-field form
            over the whole screen. It scrolls if the viewport is short. */}
        {active === 'trade' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderEntryPanel />
          </div>
        )}
        {active === 'orders' && <OrdersTablePanel className="min-h-0 flex-1" />}
      </div>
      {/* In flow now rather than fixed: the shell is exactly one viewport
          tall, so the bar sits at the bottom of it without needing to float
          over content (and without the pb-16 spacer that floating required). */}
      <nav
        className="z-20 grid shrink-0 grid-cols-4 border-t border-hairline bg-panel"
        aria-label="Trade screen sections"
      >
        {MOBILE_TABS.map((tab) => {
          const showBadge = tab.key === 'orders' && openCount > 0
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-current={active === tab.key ? 'true' : undefined}
              // Overriding the accessible name (rather than letting it fall
              // back to the visible "Orders" text) so the count is announced
              // in the same breath as the tab, not as a separate, easy-to-skip
              // node — the badge span below is `aria-hidden` for exactly
              // that reason. Same dynamic-aria-label idiom as CancelButton.
              aria-label={showBadge ? `${tab.label}, ${openCount} open order${openCount === 1 ? '' : 's'}` : undefined}
              className={`flex h-11 items-center justify-center gap-1 text-ui-body transition-colors ${
                active === tab.key ? 'text-accent' : 'text-ink-2'
              }`}
            >
              {tab.label}
              {showBadge && (
                <span aria-hidden="true" className="rounded-chip bg-panel-2 px-1 text-num-table text-ink-2">
                  {openCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function TabletTradeLayout() {
  return (
    <div className={`${TRADE_SHELL} min-h-[820px]`}>
      {/* Two columns is one short of the rail arrangement the wider tiers
          use, so order entry joins the tabbed column instead of sitting under
          the chart. Costs a tab switch to place an order; buys the chart the
          full height of the row instead of the ~40% the form used to leave
          it. The mobile tier already treats order entry as its own tab, so
          this is the same trade the layout makes one breakpoint down. */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <ChartPanel className="min-h-0" />
        <TabbedPanel
          className="min-h-0"
          tabs={[
            { key: 'book', label: 'Order book', content: <BookContent /> },
            { key: 'trades', label: 'Trades', content: <TradesContent /> },
            { key: 'entry', label: 'Order entry', content: <OrderEntryContent /> },
          ]}
        />
      </div>
      <OrdersTablePanel className="h-[190px] shrink-0" />
    </div>
  )
}

function DesktopNarrowTradeLayout() {
  return (
    <div className={`${TRADE_SHELL} min-h-[860px]`}>
      {/* Same three rails as the desktop tier, narrower — see its comments
          for why the tape rather than the form absorbs the right rail's
          slack. 300px is the floor for the order form before price and size
          have to stop sharing a row. */}
      <div className="grid min-h-0 flex-1 grid-cols-[248px_1fr_300px] gap-2">
        <OrderBookPanel className="min-h-0" />
        <ChartPanel className="min-h-0" />
        <div className="flex min-h-0 flex-col gap-2">
          <OrderEntryPanel className="shrink-0" />
          <WalletPanel className="shrink-0" />
          <TradesPanel className="min-h-0 flex-1" />
        </div>
      </div>
      <OrdersTablePanel className="h-[190px] shrink-0" />
    </div>
  )
}

function DesktopTradeLayout() {
  return (
    <div className={`${TRADE_SHELL} min-h-[880px]`}>
      {/* Right rail widened 308 -> 340: it now holds the order form rather
          than a read-only summary, and price/size sit side by side inside it
          (p-3 either side leaves 316px of usable width). */}
      <div className="grid min-h-0 flex-1 grid-cols-[288px_1fr_340px] gap-2">
        {/* The book gets a whole rail to itself. It renders as many levels as
            its height allows (OrderBook's levelsPerSide), so height converts
            directly into visible depth — ~12 levels a side here, comfortably
            more than the ten the market quotes. */}
        <OrderBookPanel className="min-h-0" />

        {/* The chart now owns the full height of the row rather than whatever
            the order form left over. */}
        <ChartPanel className="min-h-0" />

        {/* Acting rail, plus the tape as its slack absorber. Order entry and
            the wallet are both content-sized: the form has a natural height
            and stretching it just leaves a bordered panel half empty, and the
            wallet is a four-number summary. Something must still take the
            slack or the rail ends short of the other two and the screen
            regains the ragged bottom edge this layout exists to avoid — and
            the tape is the right panel for it. It's the only one here that
            genuinely reads better taller, and it degrades gracefully: on a
            short viewport it shrinks to the few most recent prints, which is
            the part that carries nearly all the value, while on a tall one it
            grows instead of leaving dead space. */}
        <div className="flex min-h-0 flex-col gap-2">
          <OrderEntryPanel className="shrink-0" />
          <WalletPanel className="shrink-0" />
          <TradesPanel className="min-h-0 flex-1" />
        </div>
      </div>
      {/* 248 -> 190. Still fixed, for the reason in the HEIGHT MODEL note
          above — a content-sized orders panel resizes the chart every time an
          order fills. But 248px was sized for a table that is empty or nearly
          empty most of the time, and every pixel it gives back goes straight
          to the rails above it. 190px still shows the tabs plus four rows. */}
      <OrdersTablePanel className="h-[190px] shrink-0" />
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
