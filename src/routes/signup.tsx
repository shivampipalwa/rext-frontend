// Sign-up screen — single centred card, no marketing copy (DESIGN.md
// "Auth"). Signup returns a token directly, so a successful signup goes
// straight to the trade screen — no "now log in" detour.

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useAuth } from '../state/useAuth'

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
  if (!password) errors.password = 'Choose a password.'
  return errors
}

/** `422` bodies are plain text, not structured per-field — best-effort read
 * of which field a message is about. `409`'s exact copy ("That email is
 * already registered.") already comes from lib/api.ts, so it's surfaced as a
 * field error on email since that's unambiguous here. */
function fieldErrorsFromApiError(err: ApiError): FieldErrors {
  if (err.status === 409) return { email: err.message }
  if (err.status === 422) {
    const msg = err.message.toLowerCase()
    if (msg.includes('email')) return { email: err.message }
    if (msg.includes('password')) return { password: err.message }
  }
  return { form: err.message || 'Something went wrong. Try again.' }
}

export default function SignupRoute() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)

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
      await signup(email.trim(), password)
      // Signup returns a token directly — straight to the trade screen, no
      // "now log in" detour.
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
        <h1 className="text-page-heading">Create account</h1>

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
              autoComplete="new-password"
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
            {pending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-ui-body text-ink-2">
          Already have an account?{' '}
          <Link to="/login" className="text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
