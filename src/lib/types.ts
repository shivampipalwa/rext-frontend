// The contract. Every other agent codes against these exact names and shapes.
// All fields here are camelCase, and all amounts are `number` — normalization
// from the raw API happens once, in lib/normalize.ts. No component should
// ever see a raw API response shape (string numbers, snake_case, PascalCase).

export type Side = 'Bid' | 'Ask'
export type OrderType = 'Limit' | 'Market'
export type OrderStatus = 'open' | 'partially_filled' | 'filled' | 'cancelled'
export type Currency = 'USD' | 'SOL'

export interface Level {
  price: number
  qty: number
}

export interface BookSnapshot {
  pair: string
  sequence: number
  bids: Level[]
  asks: Level[]
}

export interface Balance {
  currency: Currency
  available: number
  reserved: number
}

export interface Order {
  orderId: number
  pair: string
  side: Side
  orderType: OrderType
  price: number
  size: number
  filledQty: number
  status: OrderStatus
}

export interface PlacedOrder {
  orderId: number
  filledQty: number
  totalCost: number
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ts = client receive time, ms (the API's public feed carries no timestamp).
export interface Trade {
  seq: number
  price: number
  qty: number
  takerSide: Side
  ts: number
}

export type ConnState = 'connecting' | 'live' | 'reconnecting' | 'closed'

export type RejectReason =
  | 'InsufficientFunds'
  | 'InvalidPair'
  | 'InvalidAmount'
  | 'UnsupportedOrderType'
