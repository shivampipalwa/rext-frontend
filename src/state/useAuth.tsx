// Auth context — token, account id, login/signup/logout. Listens for the
// `auth:expired` event that lib/api.ts and lib/ws/ordersSocket.ts dispatch on
// a 401 or a failed private-socket handshake, and drops the session.
//
// Note: this file needs JSX (the provider), so it's .tsx despite DESIGN.md
// listing it as `useAuth.ts` — import it the same way either way:
// `import { useAuth, AuthProvider } from '../state/useAuth'`.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import { clearToken, decodeJwtSub, getToken, isExpired, setToken } from '../lib/auth'

export interface AuthContextValue {
  token: string | null
  accountId: number | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readValidToken(): string | null {
  const token = getToken()
  if (!token) return null
  if (isExpired(token)) {
    clearToken()
    return null
  }
  return token
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => readValidToken())

  const accountId = useMemo(() => (token ? decodeJwtSub(token) : null), [token])

  const applyToken = useCallback((next: string) => {
    setToken(next)
    setTokenState(next)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: next } = await api.login(email, password)
      applyToken(next)
    },
    [applyToken],
  )

  const signup = useCallback(
    async (email: string, password: string) => {
      const { token: next } = await api.signup(email, password)
      applyToken(next)
    },
    [applyToken],
  )

  const logout = useCallback(() => {
    clearToken()
    setTokenState(null)
  }, [])

  useEffect(() => {
    const handleExpired = () => setTokenState(null)
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ token, accountId, isAuthenticated: token !== null, login, signup, logout }),
    [token, accountId, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
