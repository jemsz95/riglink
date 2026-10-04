import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devAllowedHosts, isProxiedHttps } from './config/dev-hosts.ts'

// Storybook reuses this config. The router plugin would regenerate
// routeTree.gen.ts on every story change and the devtools plugin injects
// app-only chrome, so both are excluded there. Tailwind must stay -- it is what
// compiles the design tokens the guide documents.
const isStorybook = !!process.env.STORYBOOK

const allowedHosts = devAllowedHosts()
const proxiedHttps = isProxiedHttps()

// Plugin order is load-bearing: @tanstack/router-plugin MUST precede
// @vitejs/plugin-react, and the router plugin errors out if it does not.
const config = defineConfig({
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
    ...(isStorybook ? [] : [devtools()]),
    tailwindcss(),
    ...(isStorybook
      ? []
      : [tanstackRouter({ target: 'react', autoCodeSplitting: true })]),
    viteReact(),
  ],
})

export default config
