import { useEffect, useState } from 'react'
import { centsToInput, inputToCents, isMoneyInput } from './totals'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface MoneyInputProps {
  valueCents: number
  onChangeCents: (cents: number) => void
  'aria-label': string
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * A money field that holds TEXT while focused and commits cents on blur.
 *
 * Round-tripping through cents on every keystroke is what makes naive money
 * inputs unusable: typing "1.10" becomes 110 cents, which formats back as
 * "1.1", which deletes the character the user was about to type. Worse,
 * clearing the field to retype it momentarily reads as 0 and the totals
 * flicker.
 *
 * So the text is local state while the user is in the field, and the parsed
 * value is published on blur (and on each valid keystroke, so the totals bar
 * stays live without the text being rewritten under the cursor).
 */
export function MoneyInput({
  valueCents,
  onChangeCents,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: MoneyInputProps) {
  const [text, setText] = useState(() => centsToInput(valueCents))
  const [focused, setFocused] = useState(false)

  // Adopt external changes (a catalog pick, a fresh load) but never while the
  // user is typing -- that is the cursor-stealing bug.
  useEffect(() => {
    if (focused) return
    setText(centsToInput(valueCents))
  }, [valueCents, focused])

  const invalid = !isMoneyInput(text)

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      // Not type="number": it permits "1e5", silently allows more decimals
      // than cents can hold, and on iOS the spinner is unusable with gloves.
      // inputMode gets the numeric keypad without any of that.
      inputMode="decimal"
      autoComplete="off"
      value={text}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        if (isMoneyInput(next)) onChangeCents(inputToCents(next))
      }}
      onBlur={() => {
        setFocused(false)
        if (isMoneyInput(text)) {
          const cents = inputToCents(text)
          onChangeCents(cents)
          setText(centsToInput(cents))
        } else {
          // Refuse to guess. Restore the last good value rather than
          // inventing a number the user did not type.
          setText(centsToInput(valueCents))
        }
      }}
      className={cn('text-right font-mono tabular-nums', className)}
    />
  )
}

export interface DecimalInputProps {
  value: string
  onChange: (value: string) => void
  isValid: (value: string) => boolean
  'aria-label': string
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * Quantity and tax-rate field. Keeps the raw decimal STRING as the value.
 *
 * Quantities never become numbers on the client: the string goes to PostgREST
 * and Postgres casts it to numeric exactly. Parsing to a float here and back
 * is how "3.333" turns into a total that is one cent off the database's.
 */
export function DecimalInput({
  value,
  onChange,
  isValid,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: DecimalInputProps) {
  const invalid = !isValid(value)

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn('text-right font-mono tabular-nums', className)}
    />
  )
}
