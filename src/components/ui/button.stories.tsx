import { Button } from './button'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Primitives/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The primary action affordance. Use `default` for the one action that ' +
          'advances the task, `outline` or `secondary` for alternatives, and ' +
          '`ghost` for tertiary controls inside dense toolbars. Reserve ' +
          '`destructive` for irreversible actions, and always pair it with a ' +
          'confirmation step -- in the field shell a mis-tap with gloves on is ' +
          'routine rather than exceptional.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'secondary',
        'outline',
        'ghost',
        'link',
        'destructive',
      ],
    },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon'] },
    disabled: { control: 'boolean' },
  },
  args: { children: 'Send quote' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The story designers review: every variant against every size, at a glance. */
export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    const variants = [
      'default',
      'secondary',
      'outline',
      'ghost',
      'link',
      'destructive',
    ] as const
    const sizes = ['sm', 'default', 'lg'] as const
    return (
      <div className="flex flex-col gap-6">
        {sizes.map((size) => (
          <div key={size} className="flex flex-col gap-2">
            <code className="text-2xs text-muted-foreground">size={size}</code>
            <div className="flex flex-wrap items-center gap-3">
              {variants.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  },
}

export const Disabled: Story = { args: { disabled: true } }

/**
 * Touch sizing is density-driven. At `comfortable` this must clear 48px --
 * switch the Density toolbar control and compare.
 */
export const TouchTarget: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col items-start gap-3">
      <Button className="min-h-touch w-full sm:w-auto">Check in to site</Button>
      <p className="text-muted-foreground text-2xs">
        Uses <code>min-h-touch</code>, so it follows the active density rather
        than hardcoding a height.
      </p>
    </div>
  ),
}
