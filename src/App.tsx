import { useEffect, useMemo, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { AccountMenu } from './components/layout/AccountMenu'
import { Header, type DailyStats } from './components/layout/Header'
import { Toasts } from './components/layout/Toasts'
import { PAIR } from './config'
import { marketSocket } from './lib/ws/marketSocket'
import AdminRoute from './routes/admin'
import LoginRoute from './routes/login'
import SignupRoute from './routes/signup'
import TradeRoute from './routes/trade'
import WalletRoute from './routes/wallet'
import { useAuth } from './state/useAuth'
import { useBookStore } from './state/useBookStore'
import { useMarketStats } from './state/useMarketStats'
import { useOrdersFeed } from './state/useOrders'
import { useTapeStore } from './state/useTapeStore'

/** The header price tints toward bid/ask for 300ms on each tick and then
 * returns to --ink (DESIGN.md, Motion). It has to be transient state, not a
 * function of the newest trade: deriving the colour from `lastTrade.takerSide`
 * leaves the price permanently green or red, which stops encoding "a trade
 * just happened" and starts looking like a status. */
function useTickTint(lastTrade: { takerSide: string } | undefined): 'bid' | 'ask' | null {
  const [tint, setTint] = useState<'bid' | 'ask' | null>(null)

  useEffect(() => {
    if (!lastTrade) return
    setTint(lastTrade.takerSide === 'Ask' ? 'ask' : 'bid')
    const timer = setTimeout(() => setTint(null), 300)
    return () => clearTimeout(timer)
    // A new trade is a new object from the tape store, so identity is the
    // signal — `seq` can't be, since one seq can cover several trades.
  }, [lastTrade])

  return tint
}

export default function App() {
  const conn = useBookStore((s) => s.conn)
  const lastTrade = useTapeStore((s) => s.trades[0])
  const { isAuthenticated, accountId, logout } = useAuth()
  const navigate = useNavigate()

  // The tape starts empty by design (no historical-trades endpoint), so
  // without the candle-derived fallback the headline price on this page is a
  // dash on every single load until a trade happens to stream in.
  const marketStats = useMarketStats()
  const lastPriceTint = useTickTint(lastTrade)

  const dailyStats = useMemo<DailyStats | null>(() => {
    const { change, changePct, high, low, volume } = marketStats
    if (change === null || changePct === null || high === null || low === null || volume === null) return null
    return { change, changePct, high, low, volumeBase: volume }
  }, [marketStats])

  // The public book/tape feed is always live, signed in or not — the trade
  // screen works read-only when signed out (DESIGN.md). Owned at the app
  // root, not the trade route, so the header price stays current everywhere.
  useEffect(() => {
    marketSocket.connect(PAIR)
    return () => marketSocket.disconnect()
  }, [])

  // The private order feed, for the same reason and at the same level: the
  // components that read orders are not always mounted (the mobile tier hides
  // the orders table behind a bottom tab), but the feed has to stay live
  // across the whole session — the open-order count and the order form's
  // self-trade warning are only useful if they're current. No-ops when signed
  // out. Must be called here and nowhere else; see useOrdersFeed's comment.
  useOrdersFeed()

  // Session expiry routes to /login in-SPA. Tokens last 24h with no refresh
  // endpoint, so this fires on any 401 (lib/api.ts) and on a failed private
  // socket handshake (lib/ws/ordersSocket.ts); useAuth has already dropped
  // the token by the time we get here. It belongs at the router root: a hard
  // window.location navigation would reload the page, tearing down the public
  // market socket and the whole book/tape/chart state over a routine expiry.
  // The sessionStorage flag is what /login reads to explain why you're there.
  useEffect(() => {
    const onExpired = () => {
      sessionStorage.setItem('cex:session-expired', '1')
      navigate('/login', { replace: true })
    }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [navigate])

  return (
    // min-h-screen (not h-screen): the page is allowed to grow taller than
    // the viewport and scroll — see trade.tsx's header comment for why the
    // panels that used to depend on a viewport-locked ancestor now get
    // explicit heights instead. `flex-1` on <main> still fills the leftover
    // viewport height on short pages (login, a near-empty wallet) via the
    // standard min-h-screen + flex-col + flex-1 pattern; it only stops
    // "filling" and starts scrolling once content genuinely exceeds the
    // viewport, which is exactly the behaviour we want.
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Header
        lastPrice={lastTrade?.price ?? marketStats.lastPrice}
        lastPriceTint={lastPriceTint}
        dailyStats={dailyStats}
        conn={conn}
        isAuthenticated={isAuthenticated}
        accountId={accountId}
        accountMenu={<AccountMenu accountId={accountId} onSignOut={() => { logout(); navigate('/') }} />}
      />
      <main className="flex flex-1 flex-col">
        <Routes>
          <Route path="/" element={<TradeRoute />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/signup" element={<SignupRoute />} />
          <Route path="/wallet" element={<WalletRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
        </Routes>
      </main>
      <Toasts />
    </div>
  )
}
