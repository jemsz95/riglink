import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devAllowedHosts, isProxiedHttps } from './config/dev-hosts.ts'
import {
  readHostingConfig,
  supabaseCspProblem,
} from './infra/firebase/hosting.ts'

// Storybook reuses this config. The router plugin would regenerate
// routeTree.gen.ts on every story change and the devtools plugin injects
// app-only chrome, so both are excluded there. Tailwind must stay -- it is what
// compiles the design tokens the guide documents.
const isStorybook = !!process.env.STORYBOOK

const allowedHosts = devAllowedHosts()
const proxiedHttps = isProxiedHttps()

// Plugin order is load-bearing: @tanstack/router-plugin MUST precede
// @vitejs/plugin-react, and the router plugin errors out if it does not.
/**
 * Where the built app will be served from.
 *
 * A Supabase Storage bucket serves objects under
 * `/storage/v1/object/public/<bucket>/`, so every asset URL in the emitted
 * HTML has to carry that prefix -- a root-relative `/assets/index-abc.js`
 * would resolve to the project root and 404. Behind a CDN or a custom domain
 * the app sits at `/` instead, and the same source must build for both, so
 * the prefix is an env var rather than a constant.
 *
 * Must end in a slash; Vite requires it.
 */
const base = process.env.VITE_BASE_PATH ?? '/'

/**
 * Fails `vite build` when firebase.json's CSP would block the Supabase
 * project the bundle is being built against. Without it, pointing an .env
 * override at another project and deploying ships an app that cannot reach
 * its own API -- and whose Realtime fails silently.
 */
function hostingCspMatchesSupabase(): Plugin {
  return {
    name: 'riglink:hosting-csp',
    apply: 'build',
    configResolved(resolved) {
      const problem = supabaseCspProblem(
        readHostingConfig(),
        resolved.env.VITE_SUPABASE_URL,
      )
      if (problem) throw new Error(problem)
    },
  }
}

const config = defineConfig({
  base,
  resolve: { tsconfigPaths: true },
  server: {
    // Empty in a local checkout, so localhost behaviour is untouched.
    ...(allowedHosts.length ? { allowedHosts } : {}),
    // Behind an HTTPS reverse proxy the HMR client must be told to use wss on
    // 443; left to itself it dials ws://<host>:3000, which the proxy does not
    // expose, and hot reload silently stops working.
    ...(proxiedHttps ? { hmr: { protocol: 'wss', clientPort: 443 } } : {}),
  },
  plugins: [
    ...(isStorybook ? [] : [devtools(), hostingCspMatchesSupabase()]),
    tailwindcss(),
    ...(isStorybook
      ? []
      : [tanstackRouter({ target: 'react', autoCodeSplitting: true })]),
    viteReact(),
  ],
})

export default config
