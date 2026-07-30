// Sign-in screen — single centred card, no marketing copy (DESIGN.md
// "Auth"). Email, password, submit; hand-rolled validation, no form library.
//
// Cooperates with the global 401 flow instead of duplicating it: lib/api.ts
// dispatches `auth:expired` on any 401, and lib/ws/ordersSocket.ts dispatches
// the same event when the private socket's token handshake fails. useAuth
// listens for that event and drops the token; App.tsx listens for it and
// routes here in-SPA, leaving the `cex:session-expired` flag read below so
// this screen can say why you arrived.
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useAuth } from '../state/useAuth'

const SESSION_EXPIRED_KEY = 'cex:session-expired'

/** Reads and clears the one-shot "you got here because your session
 * expired" flag set by App.tsx's `auth:expired` handler. */
function readAndClearSessionExpiredFlag(): boolean {
  if (typeof window === 'undefined') return false
  const flag = sessionStorage.getItem(SESSION_EXPIRED_KEY)
  if (flag !== null) sessionStorage.removeItem(SESSION_EXPIRED_KEY)
  return flag !== null
}

interface FieldErrors {
  email?: string
  password?: string
  form?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!email.trim()) errors.email = 'Enter your email.'
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}

/** `422` bodies are plain text from the server, not structured per-field —
 * this is a best-effort read of which field the message is about. When we
 * genuinely can't tell, it surfaces as a form-level error rather than a
 * guess. `401`'s exact copy ("Email or password is incorrect.") already
 * comes from lib/api.ts, so it's just surfaced as-is. */
function fieldErrorsFromApiError(err: ApiError): FieldErrors {
  if (err.status === 422) {
    const msg = err.message.toLowerCase()
    if (msg.includes('email')) return { email: err.message }
    if (msg.includes('password')) return { password: err.message }
  }
  return { form: err.message || 'Something went wrong. Try again.' }
}

export default function LoginRoute() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)
  const [expiredNotice] = useState(readAndClearSessionExpiredFlag)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (pending) return

    const fieldErrors = validate(email, password)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setPending(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrorsFromApiError(err) : { form: 'Something went wrong. Try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-panel border border-hairline bg-panel p-6">
        <h1 className="text-page-heading">Sign in</h1>

        {expiredNotice && (
          <p role="status" className="mt-3 rounded-input border border-warn/40 bg-panel-2 px-3 py-2 text-ui-body text-warn">
            Your session expired. Sign in again.
          </p>
        )}

        {errors.form && (
          <p role="alert" className="mt-3 rounded-input border border-ask/40 bg-panel-2 px-3 py-2 text-ui-body text-ask">
            {errors.form}
          </p>
        )}

        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <label className="flex flex-col gap-1">
            <span className="text-panel-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? 'true' : undefined}
              className="h-9 rounded-input border border-hairline-2 bg-panel-2 px-3 text-ui-body text-ink"
            />
            {errors.email && (
              <span role="alert" className="text-ui-body text-ask">
                {errors.email}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-panel-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={errors.password ? 'true' : undefined}
              className="h-9 rounded-input border border-hairline-2 bg-panel-2 px-3 text-ui-body text-ink"
            />
            {errors.password && (
              <span role="alert" className="text-ui-body text-ask">
                {errors.password}
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={pending}
            className="mt-2 h-btn-primary rounded-input bg-accent text-ui-body text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-ui-body text-ink-2">
          New here?{' '}
          <Link to="/signup" className="text-accent">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
