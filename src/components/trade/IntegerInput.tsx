// All money in this API is whole `u64` units — there is no decimal. This
// input rejects `.`, `e`, `+`, `-` at the keystroke (not just on submit,
// DESIGN.md), and normalizes away leading zeros as part of the same
// controlled-value round trip so "05" can never persist on screen.
//
// `type="text"` + `inputMode="numeric"` rather than `type="number"`: the
// native number input accepts `e`, `+`, `-`, and locale decimal separators,
// which is exactly what we need to refuse.

import type { ChangeEvent, KeyboardEvent } from 'react'

const BLOCKED_KEYS = new Set(['.', ',', 'e', 'E', '+', '-'])

export interface IntegerInputProps {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  autoFocus?: boolean
}

/** Strips everything but digits, then collapses leading zeros ("00", "07" ->
 * "0", "7"). A lone "0" is preserved so the user can keep typing into it. */
function sanitize(raw: string): string {
  const digitsOnly = raw.replace(/[^0-9]/g, '')
  if (digitsOnly === '') return ''
  const stripped = digitsOnly.replace(/^0+(?=\d)/, '')
  return stripped
}

export function IntegerInput({
  value,
  onChange,
  placeholder,
  disabled,
  id,
  className = '',
  autoFocus,
  ...aria
}: IntegerInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key.length === 1 && BLOCKED_KEYS.has(e.key)) {
      e.preventDefault()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitize(e.target.value)
    if (cleaned === '') {
      onChange(null)
      return
    }
    const parsed = Number(cleaned)
    onChange(Number.isFinite(parsed) ? parsed : null)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      autoFocus={autoFocus}
      value={value === null ? '' : String(value)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={`h-9 w-full rounded-input border border-hairline bg-panel-2 px-2 text-num-form num text-ink placeholder:text-ink-3 disabled:opacity-50 ${className}`}
      {...aria}
    />
  )
}
