import { useEffect } from 'react'
import { ThemeProvider } from '../../src/lib/theme/theme-provider'
import type { Decorator } from '@storybook/react-vite'

/**
 * Owns the theme class for the preview iframe.
 *
 * `@custom-variant dark (&:is(.dark *))` requires `.dark` on an ANCESTOR, so it
 * must land on documentElement -- putting it on the story wrapper would style
 * the children but not the wrapper itself. We drive this ourselves rather than
 * using addon-themes' withThemeByClassName so there is exactly one writer of
 * the class and it stays in sync with what ThemeProvider reports to consumers.
 */
export const withTheme: Decorator = (Story, context) => {
  // Globals are untyped and genuinely absent until the toolbar initialises, so
  // the cast must stay nullable -- asserting non-null makes the fallback dead.
  const theme =
    (context.globals.theme as 'light' | 'dark' | undefined) ?? 'light'
  const density =
    (context.globals.density as 'compact' | 'comfortable' | undefined) ??
    'compact'

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [theme])

  return (
    <ThemeProvider defaultTheme={theme}>
      <div data-density={density} className="bg-background text-foreground p-4">
        <Story />
      </div>
    </ThemeProvider>
  )
}
