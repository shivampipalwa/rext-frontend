// Deployed, the API sits behind the same origin under /api, so there's no CORS
// and no mixed content. Dev still points straight at a local api process.
import type { Currency } from './lib/types'

const wsScheme = location.protocol === 'https:' ? 'wss:' : 'ws:'

export const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/api')

export const WS_BASE =
  import.meta.env.VITE_WS_BASE ??
  (import.meta.env.DEV ? 'ws://127.0.0.1:3000' : `${wsScheme}//${location.host}/api`)

export const PAIR = 'SOL-USD'
export const BASE_CCY = 'SOL'
export const QUOTE_CCY = 'USD'

// Abuse guards enforced server-side (API.md § Abuse guards). Mirrored here so
// the UI can warn *before* a submit rather than only translating the 400 —
// but the server is the authority, and every one of these still has a reject
// branch. Never let a client-side check be the only thing standing between
// the user and a rejection they can't explain.

/** Max `available + reserved` a single account may hold, per currency. The cap
 * is on the holding, so retrying a rejected deposit never helps. */
export const DEPOSIT_CAPS: Record<Currency, number> = { USD: 100_000, SOL: 1_000 }

/** A Limit order must price within ±20% of the market's last traded price.
 * Unbounded until the market's first trade. */
export const PRICE_BAND_PCT = 0.2

export const BOOK_DEPTH = 50
export const TAPE_CAP = 200
export const HISTORY_RENDER_CAP = 500
