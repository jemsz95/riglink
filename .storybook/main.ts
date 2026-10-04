import { devAllowedHosts } from '../config/dev-hosts.ts'
import type { StorybookConfig } from '@storybook/react-vite'

// Signals vite.config.ts to drop the router + devtools plugins. Set here rather
// than in the npm script so it works on any platform and in CI without a shell.
process.env.STORYBOOK = '1'

const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: [
    '../.storybook/docs/**/*.mdx',
    // Co-located component docs; `../src/**/*.mdx` is added once such a file
    // exists -- Storybook warns on every start for a pattern matching nothing.
    '../src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  // Storybook validates the Host header in TWO places: its own core-server
  // middleware (which 403s with a bare "Invalid host") and Vite's dev server.
  // `core.allowedHosts` is read once and forwarded to both, so this single
  // setting covers them -- no viteFinal override needed.
  core: { allowedHosts: devAllowedHosts() },
  docs: { defaultName: 'Docs' },
  // Required for useful autodocs prop tables; the default docgen misses
  // interface-typed props, which is most of our component API.
  typescript: { reactDocgen: 'react-docgen-typescript' },
  staticDirs: ['../public'],
}

export default config
