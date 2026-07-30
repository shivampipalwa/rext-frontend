// One normalization layer. Converts every raw API response shape (strings vs
// numbers, snake_case vs camelCase, snake_case vs PascalCase status) into the
// internal shapes from lib/types.ts. No component or state store should ever
// see a raw response — everything funnels through here first.

import type { Balance, BookSnapshot, Candle, Currency, Order, OrderStatus, OrderType, PlacedOrder, Side } from './types'

/** Defensive numeric parse — every field that might arrive as a string or a
 * number lands here. Never throws; unparseable input becomes 0. */
export function num(x: unknown): number {
  return Number(x) || 0
}

const STATUS_MAP: Record<string, OrderStatus> = {
  open: 'open',
  Open: 'open',
  partially_filled: 'partially_filled',
  PartiallyFilled: 'partially_filled',
  filled: 'filled',
  Filled: 'filled',
  cancelled: 'cancelled',
  Cancelled: 'cancelled',
}

/** Collapses REST's `partially_filled` and the private socket's
 * `PartiallyFilled` (and every other status spelling) into one lowercase
 * union. Unrecognized input defaults to 'open' rather than throwing. */
export function normalizeStatus(raw: string): OrderStatus {
  return STATUS_MAP[raw] ?? 'open'
}

export function normalizeSide(raw: string): Side {
  return raw === 'Ask' ? 'Ask' : 'Bid'
}

export function normalizeOrderType(raw: string): OrderType {
  return raw === 'Market' ? 'Market' : 'Limit'
}

export function normalizeCurrency(raw: string): Currency {
  return raw === 'SOL' ? 'SOL' : 'USD'
}

// ---- Raw shapes, as documented in API.md ----------------------------------

/** `GET /balances` — every numeric field is a JSON string. */
export interface RawBalance {
  currency: string
  available: string | number
  reserved: string | number
}

export function normalizeBalance(raw: RawBalance): Balance {
  return {
    currency: normalizeCurrency(raw.currency),
    available: num(raw.available),
    reserved: num(raw.reserved),
  }
}

/** `GET /orders` — every field including `order_id` is a JSON string. */
export interface RawOrderRest {
  order_id: string | number
  pair: string
  side: string
  order_type: string
  price: string | number
  size: string | number
  filled_qty: string | number
  status: string
}

export function normalizeOrder(raw: RawOrderRest): Order {
  return {
    orderId: num(raw.order_id),
    pair: raw.pair,
    side: normalizeSide(raw.side),
    orderType: normalizeOrderType(raw.order_type),
    price: num(raw.price),
    size: num(raw.size),
    filledQty: num(raw.filled_qty),
    status: normalizeStatus(raw.status),
  }
}

/** `POST /orders` — real JSON numbers, unlike the REST read endpoints. */
export interface RawPlacedOrder {
  order_id: number | string
  filled_qty: number | string
  total_cost: number | string
}

export function normalizePlacedOrder(raw: RawPlacedOrder): PlacedOrder {
  return {
    orderId: num(raw.order_id),
    filledQty: num(raw.filled_qty),
    totalCost: num(raw.total_cost),
  }
}

/** `GET /book/:pair` — real numbers. */
export interface RawLevel {
  price: number | string
  qty: number | string
}

export interface RawBookSnapshot {
  pair: string
  sequence: number | string
  bids: RawLevel[]
  asks: RawLevel[]
}

export function normalizeBookSnapshot(raw: RawBookSnapshot): BookSnapshot {
  return {
    pair: raw.pair,
    sequence: num(raw.sequence),
    bids: raw.bids.map((l) => ({ price: num(l.price), qty: num(l.qty) })),
    asks: raw.asks.map((l) => ({ price: num(l.price), qty: num(l.qty) })),
  }
}

/** `GET /candles/:pair` — real numbers, ascending by time. */
export interface RawCandle {
  time: number | string
  open: number | string
  high: number | string
  low: number | string
  close: number | string
  volume: number | string
}

export function normalizeCandle(raw: RawCandle): Candle {
  return {
    time: num(raw.time),
    open: num(raw.open),
    high: num(raw.high),
    low: num(raw.low),
    close: num(raw.close),
    volume: num(raw.volume),
  }
}

// ---- Private WebSocket (`/ws/orders`) --------------------------------------
// Externally tagged: `{ OrderAccepted: {...} }` / `{ OrderUpdated: {...} }`.
// Read the variant with `Object.keys(msg)[0]` — see lib/ws/ordersSocket.ts.

export interface RawOrderAccepted {
  order_id: number
  account_id: number
  pair: string
  side: string
  order_type: string
  price: number
  size: number
}

/** An accepted order has no fills or status yet — normalize it as a fresh
 * resting order. Any fill is reported by a subsequent OrderUpdated. */
export function normalizeOrderAccepted(raw: RawOrderAccepted): Order {
  return {
    orderId: num(raw.order_id),
    pair: raw.pair,
    side: normalizeSide(raw.side),
    orderType: normalizeOrderType(raw.order_type),
    price: num(raw.price),
    size: num(raw.size),
    filledQty: 0,
    status: 'open',
  }
}

export interface RawOrderUpdated {
  order_id: number
  account_id: number
  pair: string
  filled_qty: number
  remaining_qty: number
  status: string
}

/** A partial patch — `filledQty` is cumulative (set, don't accumulate). */
export interface OrderUpdate {
  orderId: number
  filledQty: number
  remainingQty: number
  status: OrderStatus
}

export function normalizeOrderUpdated(raw: RawOrderUpdated): OrderUpdate {
  return {
    orderId: num(raw.order_id),
    filledQty: num(raw.filled_qty),
    remainingQty: num(raw.remaining_qty),
    status: normalizeStatus(raw.status),
  }
}
