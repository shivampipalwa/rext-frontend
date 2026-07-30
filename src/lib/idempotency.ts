// Monotonic X-Client-Order-Id generator. The server requires this id be
// unique per account "forever" (well, within the last 1000 writes). A
// per-account counter in localStorage, seeded from Date.now(), is the
// simplest correct implementation: even a cleared browser starts from a
// value far past the server's recent-id window instead of colliding with it.

const STORAGE_PREFIX = 'cex:client-order-id:'

/** Returns a value strictly greater than every value this function has ever
 * returned for this account, in this browser. Never returns the same value
 * twice. */
export function nextClientOrderId(accountId: number): number {
  const key = STORAGE_PREFIX + String(accountId)
  const stored = Number(localStorage.getItem(key))
  const seed = Date.now()
  const prev = Number.isFinite(stored) && stored > 0 ? stored : seed
  // Guard against the wall clock seed being behind a counter that has
  // already advanced past it (e.g. many writes in the same millisecond, or a
  // clock adjustment) — always move strictly forward.
  const next = Math.max(prev + 1, seed)
  localStorage.setItem(key, String(next))
  return next
}
