import { Briefcase, Plus, SearchX } from 'lucide-react'
import { EmptyState } from './empty-state'
import { Button } from '@/components/ui/button'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'App/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Two empty states are not the same thing and must never share copy. ' +
          '"You have no jobs yet" invites the user to create one. "No jobs ' +
          'match these filters" invites them to widen the filters. Showing the ' +
          'first while a filter is active makes a user believe their data has ' +
          'been deleted -- which is a support call, not a UI nitpick.\n\n' +
          'An empty state with no action is a dead end; pass one.',
      },
    },
  },
  args: { title: 'No jobs yet' },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing exists yet. The action creates the first one. */
export const FirstRun: Story = {
  args: {
    icon: Briefcase,
    title: 'No jobs yet',
    body: 'Create the first job, or wait for a client to request one through the portal.',
    action: (
      <Button>
        <Plus className="size-4" aria-hidden />
        New job
      </Button>
    ),
  },
}

/** Data exists but is filtered out. The body says so explicitly, and the
 *  action clears the filters rather than creating anything. */
export const Filtered: Story = {
  args: {
    icon: SearchX,
    title: 'No jobs match these filters',
    body: 'Nothing here is deleted -- widen the filters to see it again.',
    action: <Button variant="outline">Clear filters</Button>,
  },
}

/** Permission, not absence. No action, because the user cannot resolve it
 *  themselves -- the body tells them who can. */
export const NotPermitted: Story = {
  args: {
    title: 'You cannot create jobs',
    body: 'Ask an owner or admin for dispatcher access.',
  },
}
