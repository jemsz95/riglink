import { useEffect, useState } from 'react'

/**
 * Delays a fast-changing value so it can be used as a query key.
 *
 * Without it every keystroke is a request, and the responses race: a slow
 * response for "boi" can land after the one for "boiler" and overwrite it.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
