import { withTheme } from './decorators/with-theme'
import '../src/styles.css'
import type { Preview } from '@storybook/react-vite'

const preview: Preview = {
  decorators: [withTheme],
  parameters: {
    controls: { expanded: true, matchers: { color: /(background|color)$/i } },
    a11y: { test: 'todo' },
    options: {
      // Tokens first, then primitives, then app, then domain, then pages:
      // the order a designer reads the system in.
      storySort: {
        order: [
          'Design Tokens',
          'Patterns',
          'Primitives',
          'App',
          'Domain',
          'Pages',
        ],
      },
    },
    viewport: {
      options: {
        iphoneSe: {
          name: 'iPhone SE',
          styles: { width: '375px', height: '667px' },
        },
        pixelField: {
          name: 'Pixel (field)',
          styles: { width: '412px', height: '915px' },
        },
        tablet: {
          name: 'Tablet',
          styles: { width: '834px', height: '1112px' },
        },
        laptop: {
          name: 'Laptop',
          styles: { width: '1440px', height: '900px' },
        },
        wide: { name: 'Wide', styles: { width: '1920px', height: '1080px' } },
      },
    },
  },
  initialGlobals: { theme: 'light', density: 'compact' },
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    density: {
      description: 'Layout density (comfortable = field/glove ergonomics)',
      toolbar: {
        title: 'Density',
        icon: 'component',
        items: [
          { value: 'compact', title: 'Compact (office)' },
          { value: 'comfortable', title: 'Comfortable (field)' },
        ],
        dynamicTitle: true,
      },
    },
  },
}

export default preview
