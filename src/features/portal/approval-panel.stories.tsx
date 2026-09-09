import { ApprovalPanel } from './approval-panel'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Domain/ApprovalPanel',
  component: ApprovalPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The approval moment — the most consequential button in the ' +
          'product, because it commits the client to a price.\n\n' +
          'Deliberate friction on both paths: the total is restated inside ' +
          'the confirmation dialog, and declining asks for a reason (optional, ' +
          'but a decline with no explanation costs a phone call).\n\n' +
          'Approving is NOT styled as a warning. It is the expected, positive ' +
          'action; dressing it in alarm colours trains people to ignore real ' +
          'warnings. Amber and red are reserved for things that actually need ' +
          'attention.\n\n' +
          'Every state here is also enforced server-side — a `viewer` contact ' +
          'is refused by the RPC with 42501, and an expired quote by a check ' +
          'at decision time. The UI states exist so people are not shown ' +
          'buttons that will fail, not as the security boundary.',
      },
    },
  },
  args: {
    totalCents: 30436,
    currency: 'USD',
    validUntil: '2026-04-15',
    pending: false,
    canDecide: true,
    onDecide: () => {},
  },
} satisfies Meta<typeof ApprovalPanel>

export default meta
type Story = StoryObj<typeof meta>

export const AwaitingDecision: Story = {}

/** No expiry date, so the copy shifts from a deadline to the consequence. */
export const NoExpiry: Story = { args: { validUntil: null } }

/** A `viewer` contact. Read-only, and told who can act instead of being shown
 *  a disabled button with no explanation. */
export const ReadOnlyContact: Story = { args: { canDecide: false } }

/** Past `valid_until`. The RPC refuses this too, so the panel and the server
 *  agree rather than the UI optimistically allowing it. */
export const Expired: Story = { args: { validUntil: '2026-01-01' } }

/** Mid-submission. Never optimistic: the server freezes a snapshot, writes an
 *  append-only approval row and moves the job in one transaction, so claiming
 *  the outcome early would be claiming something we do not have yet. */
export const Submitting: Story = { args: { pending: true } }
