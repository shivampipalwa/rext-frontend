// Private order feed — first-message token handshake, reauth on close.
//
// Auth is a first-message handshake, not a header (browsers can't set
// Authorization on a WebSocket): open the socket, then IMMEDIATELY send
// `{"token":"<jwt>"}` as the first frame. The server closes within 5s on a
// bad token, with no close code and no reason — bad-token and timeout are
// indistinguishable, so ANY close before we've confirmed the handshake is
// treated as an auth failure: clear the token and dispatch `auth:expired`.
//
// Messages are externally tagged single-key wrappers, e.g.
// `{"OrderAccepted": {...}}` — read the variant via `Object.keys(msg)[0]`.
// There's no ack message, so confirmation of a successful handshake is
// either (a) the first real message, or (b) surviving the server's 5s
// auth-timeout window without being closed. (b) matters because an account
// with no order activity would otherwise be permanently misclassified as
// "auth failure" on the next ordinary network drop — this is an
// interpretation of an API.md gap, not something the doc states outright.
//
// There's no sequence number on this feed, so reconciliation is best-effort:
// on every successful (re)connect, callers are told to refetch the full
// order list via `onNeedsResync` rather than trusting a merge.

import { WS_BASE } from '../../config'
import { clearToken } from '../auth'
import { normalizeOrderAccepted, normalizeOrderUpdated, type OrderUpdate, type RawOrderAccepted, type RawOrderUpdated } from '../normalize'
import type { Order } from '../types'

export interface OrdersSocketHandlers {
  onOrderAccepted: (order: Order) => void
  onOrderUpdated: (update: OrderUpdate) => void
  /** Fires once per successful (re)connect. No seq on this feed, so the
   * caller should refetch GET /orders rather than trust the socket alone. */
  onNeedsResync: () => void
}

const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 8000
const AUTH_CONFIRM_TIMEOUT_MS = 5500 // server's 5s window + margin

class OrdersSocketController {
  private ws: WebSocket | null = null
  private token: string | null = null
  private handlers: OrdersSocketHandlers | null = null
  private authConfirmed = false
  private authTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closedByClient = false

  connect(token: string, handlers: OrdersSocketHandlers): void {
    this.closedByClient = false
    this.token = token
    this.handlers = handlers
    this.reconnectAttempt = 0
    this.open()
  }

  disconnect(): void {
    this.closedByClient = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.authTimer) clearTimeout(this.authTimer)
    this.reconnectTimer = null
    this.authTimer = null
    this.ws?.close()
    this.ws = null
  }

  private open(): void {
    if (!this.token || this.closedByClient) return
    this.authConfirmed = false

    const ws = new WebSocket(`${WS_BASE}/ws/orders`)
    this.ws = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ token: this.token }))
      this.authTimer = setTimeout(() => this.confirmAuth(), AUTH_CONFIRM_TIMEOUT_MS)
    }

    ws.onmessage = (event) => {
      this.confirmAuth()
      const msg = JSON.parse(event.data as string) as Record<string, unknown>
      const key = Object.keys(msg)[0]
      if (key === 'OrderAccepted') {
        this.handlers?.onOrderAccepted(normalizeOrderAccepted(msg[key] as RawOrderAccepted))
      } else if (key === 'OrderUpdated') {
        this.handlers?.onOrderUpdated(normalizeOrderUpdated(msg[key] as RawOrderUpdated))
      }
    }

    ws.onclose = () => {
      if (this.authTimer) {
        clearTimeout(this.authTimer)
        this.authTimer = null
      }
      if (this.closedByClient) return

      if (!this.authConfirmed) {
        // Closed before we ever confirmed the handshake — treat as bad/expired
        // token. Do not loop retrying a token that will never work.
        clearToken()
        window.dispatchEvent(new CustomEvent('auth:expired'))
        return
      }

      this.scheduleReconnect()
    }
  }

  private confirmAuth(): void {
    if (this.authConfirmed) return
    this.authConfirmed = true
    if (this.authTimer) {
      clearTimeout(this.authTimer)
      this.authTimer = null
    }
    this.reconnectAttempt = 0
    this.handlers?.onNeedsResync()
  }

  private scheduleReconnect(): void {
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.reconnectAttempt)
    const jitter = Math.random() * base * 0.3
    const delay = Math.min(RECONNECT_MAX_MS, base + jitter)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }
}

/** Singleton controller. Call `ordersSocket.connect(token, handlers)` after
 * login (and on app load if a valid token exists), `ordersSocket.disconnect()`
 * on logout. */
export const ordersSocket = new OrdersSocketController()
