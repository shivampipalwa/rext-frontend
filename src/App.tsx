import { useEffect } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { Header } from './components/layout/Header'
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
import { useTapeStore } from './state/useTapeStore'

export default function App() {
  const conn = useBookStore((s) => s.conn)
  const seq = useBookStore((s) => s.seq)
  const lastTrade = useTapeStore((s) => s.trades[0])
  const { isAuthenticated, accountId } = useAuth()
  const navigate = useNavigate()

  // The public book/tape feed is always live, signed in or not — the trade
  // screen works read-only when signed out (DESIGN.md). Owned at the app
  // root, not the trade route, so header price/seq stay current everywhere.
  useEffect(() => {
    marketSocket.connect(PAIR)
    return () => marketSocket.disconnect()
  }, [])

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
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <Header
        lastPrice={lastTrade?.price ?? null}
        lastPriceTint={lastTrade ? (lastTrade.takerSide === 'Ask' ? 'ask' : 'bid') : null}
        conn={conn}
        seq={seq}
        isAuthenticated={isAuthenticated}
        accountId={accountId}
      />
      <main className="flex min-h-0 flex-1 flex-col">
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
