import { StatusTimeline } from './status-timeline'
import type { JobStatusEventRow } from '@/features/jobs/queries'
import type { Meta, StoryObj } from '@storybook/react-vite'

const events: Array<JobStatusEventRow> = [
  {
    id: 1,
    from_status: 'draft',
    to_status: 'requested',
    actor_user_id: null,
    actor_kind: 'client',
    reason: null,
    created_at: '2026-03-02T09:14:00Z',
  },
  {
    id: 2,
    from_status: 'requested',
    to_status: 'triaged',
    actor_user_id: 'a',
    actor_kind: 'staff',
    reason: null,
    created_at: '2026-03-02T11:02:00Z',
  },
  {
    id: 3,
    from_status: 'triaged',
    to_status: 'quoted',
    actor_user_id: 'a',
    actor_kind: 'staff',
    reason: null,
    created_at: '2026-03-03T16:40:00Z',
  },
  {
    id: 4,
    from_status: 'quoted',
    to_status: 'approved',
    actor_user_id: 'b',
    actor_kind: 'client',
    reason: 'Approved by finance, PO 44812',
    created_at: '2026-03-05T08:20:00Z',
  },
]

const meta = {
  title: 'Domain/StatusTimeline',
  component: StatusTimeline,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          "A job's audit trail, in the order it happened.\n\n" +
          '`actor_kind` is shown on every entry, not just staff ones. When a ' +
          'dispute arises about who approved a large quote, ' +
          '"Client - 5 Mar, 08:20" is the entire answer. The table this reads ' +
          'from has no UPDATE or DELETE policy for anyone, including org ' +
          'owners, which is what makes it an audit trail rather than a log.\n\n' +
          'Timestamps render in the SITE timezone where there is one, falling ' +
          "back to the org's -- a job two zones away otherwise shows the wrong " +
          'day to the tech standing in it.',
      },
    },
  },
  args: { events, timezone: 'UTC' },
} satisfies Meta<typeof StatusTimeline>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** A client-caused transition carries a reason. Staff cannot forge one of
 *  these: client transitions run inside a SECURITY DEFINER RPC that sets
 *  `actor_kind`, and staff are never offered the client's edges. */
export const WithClientApproval: Story = {
  args: { events: events.slice(3) },
}

/** Freshly created. The job exists as a draft and has moved nowhere, so there
 *  is genuinely nothing to show -- said in words rather than left blank. */
export const Empty: Story = {
  args: { events: [] },
}

/**
 * Deploy skew: the database enum gained a status this build has never heard of.
 * It degrades to a readable neutral chip instead of crashing the row, which is
 * what an unguarded `PRESENTATION[status]` lookup would do.
 */
export const UnknownStatus: Story = {
  args: {
    events: [
      {
        id: 9,
        from_status: 'invoiced',
        to_status: 'awaiting_remittance',
        actor_user_id: null,
        actor_kind: 'system',
        reason: null,
        created_at: '2026-03-09T10:00:00Z',
      },
    ],
  },
}
