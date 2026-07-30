// Token storage (localStorage) and JWT payload decoding.
//
// decodeJwtSub/isExpired read the token payload WITHOUT verifying the
// signature — this is display/keying only (choosing a localStorage key,
// showing "account 3" in the header) and must NEVER be trusted for
// authorization. The server is the only party that verifies the signature;
// every actual permission check happens there.

const TOKEN_KEY = 'cex:token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const percentEncoded = Array.from(binary, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  return decodeURIComponent(percentEncoded)
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>
  } catch {
    return null
  }
}

/** The account id, read from the JWT's `sub` claim. DISPLAY/KEYING ONLY —
 * never use this to decide what the UI allows; the server enforces that. */
export function decodeJwtSub(token: string): number | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  const sub = payload.sub
  if (typeof sub === 'number' && Number.isFinite(sub)) return sub
  if (typeof sub === 'string') {
    const n = Number(sub)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** True if the token's `exp` claim is in the past, or the token can't be
 * read at all (treated as expired so the app re-prompts for login). */
export function isExpired(token: string): boolean {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  if (typeof exp !== 'number') return true
  return Date.now() >= exp * 1000
}
