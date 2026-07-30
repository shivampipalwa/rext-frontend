// Typed REST client. Implements API.md's error model and idempotency
// contract faithfully — this is the only file that talks to `fetch`.

import { API_BASE } from '../config'
import { clearToken, decodeJwtSub, getToken } from './auth'
import { nextClientOrderId } from './idempotency'
import {
  normalizeBalance,
  normalizeBookSnapshot,
  normalizeCandle,
  normalizeOrder,
  normalizePlacedOrder,
  num,
  type RawBalance,
  type RawBookSnapshot,
  type RawCandle,
  type RawOrderRest,
  type RawPlacedOrder,
} from './normalize'
import type { Balance, BookSnapshot, Candle, Currency, Order, OrderType, PlacedOrder, RejectReason, Side } from './types'

export class ApiError extends Error {
  status: number
  /** Set only for a 400 with a body — a bare JSON string reject reason from
   * the matching engine. Absent for a 400 with an empty body (client bug:
   * bad id or malformed pair) and for every other status. */
  reason?: RejectReason

  constructor(status: number, message: string, reason?: RejectReason) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
  }
}

function dispatchAuthExpired(): void {
  clearToken()
  window.dispatchEvent(new CustomEvent('auth:expired'))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const KNOWN_REASONS: readonly RejectReason[] = ['InsufficientFunds', 'InvalidPair', 'InvalidAmount', 'UnsupportedOrderType']

function asRejectReason(value: unknown): RejectReason | undefined {
  return typeof value === 'string' && (KNOWN_REASONS as readonly string[]).includes(value) ? (value as RejectReason) : undefined
}

/** Turns a fetch Response into parsed JSON (or undefined for an empty/204
 * body), or throws an ApiError describing exactly what went wrong. Shared by
 * every read and write call except signup/login, which have their own
 * status meanings (see authRequest). */
async function parseOrThrow(res: Response): Promise<unknown> {
  if (res.status === 401) {
    dispatchAuthExpired()
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }
  if (res.status === 403) {
    throw new ApiError(403, "This account isn't the exchange admin.")
  }
  if (res.status === 404) {
    throw new ApiError(404, 'Not found.')
  }
  if (res.status === 409) {
    throw new ApiError(409, 'Duplicate request — the previous attempt may have already landed.')
  }
  if (res.status === 400) {
    const text = await res.text()
    if (text) {
      let reason: RejectReason | undefined
      try {
        reason = asRejectReason(JSON.parse(text))
      } catch {
        // Not JSON — fall through with the raw text as the message.
      }
      throw new ApiError(400, reason ?? text, reason)
    }
    throw new ApiError(400, 'Request was rejected before reaching the engine — check the request and retry.')
  }
  if (res.status === 422) {
    const text = await res.text()
    throw new ApiError(422, text || 'The request body was invalid.')
  }
  if (res.status === 500) {
    throw new ApiError(500, 'Internal server error. Try again.')
  }
  if (res.status === 504) {
    throw new ApiError(504, 'Engine timed out.')
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Unexpected response (${res.status}).`)
  }
  if (res.status === 204) return undefined
  const text = await res.text()
  if (!text) return undefined
  return JSON.parse(text)
}

// ---- Public reads -----------------------------------------------------

async function publicGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`)
  return parseOrThrow(res)
}

export async function getBook(pair: string, depth: number): Promise<BookSnapshot> {
  const raw = (await publicGet(`/book/${encodeURIComponent(pair)}?depth=${depth}`)) as RawBookSnapshot
  return normalizeBookSnapshot(raw)
}

export type CandleInterval = '1s' | '15m' | '1h' | '4h' | '1d' | '1w'

export interface GetCandlesOpts {
  start?: number
  end?: number
  limit?: number
}

export async function getCandles(pair: string, interval: CandleInterval, opts: GetCandlesOpts = {}): Promise<Candle[]> {
  const params = new URLSearchParams({ interval })
  if (opts.start !== undefined) params.set('start', String(opts.start))
  if (opts.end !== undefined) params.set('end', String(opts.end))
  if (opts.limit !== undefined) params.set('limit', String(opts.limit))
  const raw = (await publicGet(`/candles/${encodeURIComponent(pair)}?${params.toString()}`)) as RawCandle[]
  return raw.map(normalizeCandle)
}

// ---- Auth ---------------------------------------------------------------
// Signup/login are neither authenticated nor idempotent-write endpoints —
// their 401/409 mean "wrong credentials" / "email taken", not "session
// expired", so they get their own status handling rather than parseOrThrow's
// (which would incorrectly clear a token and fire auth:expired).

async function authRequest(path: string, body: { email: string; password: string }): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new ApiError(401, 'Email or password is incorrect.')
  if (res.status === 409) throw new ApiError(409, 'That email is already registered.')
  if (res.status === 422) {
    const text = await res.text()
    throw new ApiError(422, text || 'Check your email and password and try again.')
  }
  if (!res.ok) throw new ApiError(res.status, `Unexpected response (${res.status}).`)
  return (await res.json()) as { token: string }
}

export function signup(email: string, password: string): Promise<{ token: string }> {
  return authRequest('/auth/signup', { email, password })
}

export function login(email: string, password: string): Promise<{ token: string }> {
  return authRequest('/auth/login', { email, password })
}

// ---- Authenticated reads --------------------------------------------------

async function authedGet(path: string): Promise<unknown> {
  const token = getToken()
  if (!token) {
    dispatchAuthExpired()
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseOrThrow(res)
}

export async function getBalances(): Promise<Balance[]> {
  const raw = (await authedGet('/balances')) as RawBalance[]
  return raw.map(normalizeBalance)
}

export async function getOrders(): Promise<Order[]> {
  const raw = (await authedGet('/orders')) as RawOrderRest[]
  return raw.map(normalizeOrder)
}

// ---- Authenticated, idempotent writes --------------------------------------
// Every write sends X-Client-Order-Id. A 504 retries with the SAME id, twice,
// backing off 400ms then 1200ms — that header exists precisely so a timed-out
// write can be safely replayed. A 409 means it already landed; it is never
// retried, and the ApiError should be caught to trigger reconciliation via
// GET /orders.

const RETRY_DELAYS_MS = [0, 400, 1200] as const

async function writeRequest(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<unknown> {
  const token = getToken()
  if (!token) {
    dispatchAuthExpired()
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }
  const accountId = decodeJwtSub(token)
  if (accountId === null) {
    dispatchAuthExpired()
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }
  const clientOrderId = nextClientOrderId(accountId)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Client-Order-Id': String(clientOrderId),
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let lastError: unknown
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) await sleep(RETRY_DELAYS_MS[attempt])

    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (networkError) {
      // A network-level failure is as ambiguous as a 504 — the request may
      // have landed server-side. Same retry contract: same id, keep going.
      lastError = networkError
      continue
    }

    if (res.status === 504) {
      lastError = new ApiError(504, 'Engine timed out.')
      continue
    }

    return await parseOrThrow(res)
  }

  void lastError // both branches above land here only via timeout/network failure
  throw new ApiError(504, 'Engine timed out after retries — check order status before retrying.')
}

export interface PlaceOrderInput {
  pair: string
  side: Side
  orderType: OrderType
  /** Required even for Market orders — send 0; the engine ignores it. */
  price: number
  size: number
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const raw = (await writeRequest('/orders', 'POST', {
    pair: input.pair,
    order_type: input.orderType,
    side: input.side,
    price: input.price,
    size: input.size,
  })) as RawPlacedOrder
  return normalizePlacedOrder(raw)
}

export async function cancelOrder(orderId: number): Promise<void> {
  await writeRequest(`/orders/${orderId}`, 'DELETE')
}

export async function deposit(amount: number, currency: Currency): Promise<{ available: number }> {
  const raw = (await writeRequest('/deposits', 'POST', { amount, currency })) as { available: unknown }
  return { available: num(raw.available) }
}

export async function withdraw(amount: number, currency: Currency): Promise<void> {
  await writeRequest('/withdrawals', 'POST', { amount, currency })
}

export async function listPair(pair: string): Promise<void> {
  await writeRequest('/admin/pairs', 'POST', { pair })
}

export async function delistPair(pair: string): Promise<void> {
  await writeRequest(`/admin/pairs/${encodeURIComponent(pair)}`, 'DELETE')
}
