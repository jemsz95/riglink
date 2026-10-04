import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'riglink.theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      return stored
  } catch {
    // Private mode / blocked storage: fall through to the default.
  }
  return 'system'
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Owns the `.dark` class that `@custom-variant dark` in styles.css keys off.
 * Deliberately local rather than `next-themes`: this is ~40 lines, has no
 * framework assumptions, and lets Storybook force a theme via `defaultTheme`.
 */
export function ThemeProvider({
  children,
  defaultTheme,
}: {
  children: ReactNode
  /** Forces a theme and skips persistence. Used by Storybook decorators. */
  defaultTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(
    () => defaultTheme ?? readStoredTheme(),
  )
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    theme === 'system' ? systemTheme() : theme,
  )

  useEffect(() => {
    const next = theme === 'system' ? systemTheme() : theme
    setResolved(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.style.colorScheme = next

    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const sys = systemTheme()
      setResolved(sys)
      document.documentElement.classList.toggle('dark', sys === 'dark')
      document.documentElement.style.colorScheme = sys
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next)
      if (defaultTheme) return
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Non-fatal: the theme still applies for this session.
      }
    },
    [defaultTheme],
  )

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
