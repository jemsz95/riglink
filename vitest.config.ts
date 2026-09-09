import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'

/**
 * Two projects, deliberately separate:
 *
 *  - `unit` (jsdom) runs everywhere, including CI containers with no browser.
 *  - `browser` needs a real engine. Anything that depends on the CSS engine --
 *    oklch conversion, computed styles, the `@theme inline` dark-mode
 *    regression check -- belongs here, because jsdom does not implement colour
 *    conversion and would report false passes.
 *
 * `npm test` runs `unit` only. `npm run test:browser` opts into the rest, so a
 * machine without Playwright's system libraries still gets a green default run
 * instead of a misleading failure.
 */
export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: [
            'src/**/*.test.{ts,tsx}',
            '.storybook/**/*.test.{ts,tsx}',
            'config/**/*.test.{ts,tsx}',
            // The hosting config's headers and routing are pure and belong
            // under test even though they ship outside the bundle.
            'infra/**/*.test.{ts,tsx}',
          ],
          // `*.browser.test.ts` also matches `*.test.ts`. Without this the
          // browser specs run under jsdom, which has no colour conversion and
          // reports confident nonsense.
          exclude: ['**/*.browser.test.{ts,tsx}', '**/node_modules/**'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: [
            'src/**/*.browser.test.{ts,tsx}',
            '.storybook/**/*.browser.test.{ts,tsx}',
          ],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
