// Integer-only display. Money in this API has no decimal places — the single
// exception is average fill price (derived, never stored), which is the only
// place a decimal is allowed to appear anywhere in the app.

/** Thousands-separated integer, e.g. 12480 -> "12,480". Rounds defensively —
 * every value passing through here should already be a whole number. */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
}

/** Average fill price = totalCost / filledQty, to 2dp. The ONLY decimal in
 * the app — label it as derived wherever it's shown. Returns null when
 * filledQty is 0 (nothing filled, so there's no average to show). */
export function fmtAvgPrice(totalCost: number, filledQty: number): string | null {
  if (!filledQty) return null
  const avg = totalCost / filledQty
  return avg.toFixed(2)
}

/** Local HH:MM:SS, 24h clock, zero-padded — for tape rows and order rows. */
export function fmtTime(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** Coarse relative time from a past timestamp (ms) to now, e.g. "3s ago",
 * "5m ago", "2h ago", "3d ago". */
export function fmtRelative(ms: number): string {
  const deltaSec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (deltaSec < 1) return 'just now'
  if (deltaSec < 60) return `${deltaSec}s ago`
  const deltaMin = Math.floor(deltaSec / 60)
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHour = Math.floor(deltaMin / 60)
  if (deltaHour < 24) return `${deltaHour}h ago`
  const deltaDay = Math.floor(deltaHour / 24)
  return `${deltaDay}d ago`
}
