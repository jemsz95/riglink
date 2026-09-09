import { JobStatusBadge } from './job-status-badge'
import { JOB_STATUS_EXCEPTIONAL, JOB_STATUS_ORDER } from '@/lib/supabase/db'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Domain/JobStatusBadge',
  component: JobStatusBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The job lifecycle vocabulary. Every badge carries an icon AND a ' +
          'label -- never colour alone. Three independent reasons: around 8% ' +
          'of men cannot separate the red `declined` chip from the green ' +
          '`client_accepted` one; a phone in direct sunlight loses most colour ' +
          'distinction, and that is the normal viewing condition for a tech; ' +
          'and a client who prints a quote for their finance team may print it ' +
          'greyscale.\n\n' +
          'Colours come from the dedicated `--status-*` ramp, which is ' +
          'separate from the brand palette on purpose. Status must stay ' +
          'legible if the brand colour changes, and a client-branded portal ' +
          'must not turn "cancelled" into a brand accent.',
      },
    },
  },
  argTypes: {
    status: {
      control: 'select',
      options: [...JOB_STATUS_ORDER, ...JOB_STATUS_EXCEPTIONAL],
    },
    compact: { control: 'boolean' },
  },
  args: { status: 'in_progress' },
} satisfies Meta<typeof JobStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The happy path, in lifecycle order -- this is the order the badge ramp
 *  is designed to read in, from cool "not started" through warm "active" to
 *  settled green "done". */
export const Lifecycle: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {JOB_STATUS_ORDER.map((status) => (
        <JobStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
}

/** States off the happy path. Deliberately desaturated apart from `declined`,
 *  so a list of held and cancelled jobs does not read as a list of errors. */
export const Exceptional: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {JOB_STATUS_EXCEPTIONAL.map((status) => (
        <JobStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
}

/** Icon only, for the narrowest phone layouts. The label stays in the
 *  accessibility tree via `sr-only` -- it is hidden visually, never removed. */
export const Compact: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {JOB_STATUS_ORDER.map((status) => (
        <JobStatusBadge key={status} status={status} compact />
      ))}
    </div>
  ),
}

/**
 * The pairing that motivates the icon rule. Under a greyscale filter these two
 * must still be distinguishable -- which they are by glyph, not by tone.
 */
export const GreyscaleCheck: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <JobStatusBadge status="client_accepted" />
        <JobStatusBadge status="declined" />
      </div>
      <div className="flex gap-2 grayscale">
        <JobStatusBadge status="client_accepted" />
        <JobStatusBadge status="declined" />
      </div>
    </div>
  ),
}
