import {
  Ban,
  CalendarCheck,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  FileText,
  Inbox,
  PauseCircle,
  Receipt,
  ThumbsDown,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { canDispatch } from '@/features/orgs/permissions'
import type { JobStatus } from '@/lib/supabase/db'

export type ActorKind = 'staff' | 'client' | 'system'

export interface StatusPresentation {
  label: string
  /** Never colour alone: colour-blind users and sunlit phone screens both need
   *  the glyph, and a printed quote may be greyscale. */
  icon: LucideIcon
  /** Literal utility classes -- a runtime-built `text-status-${x}` is invisible
   *  to the Tailwind scanner and silently produces no CSS. */
  className: string
  /** True for states where the ball is in the client's court. Drives the "waiting
   *  on client" grouping on the dashboard. */
  awaitingClient: boolean
}

export const JOB_STATUS_PRESENTATION: Record<JobStatus, StatusPresentation> = {
  draft: {
    label: 'Draft',
    icon: CircleDashed,
    className: 'text-status-draft border-status-draft/30 bg-status-draft/10',
    awaitingClient: false,
  },
  requested: {
    label: 'Requested',
    icon: Inbox,
    className:
      'text-status-requested border-status-requested/30 bg-status-requested/10',
    awaitingClient: false,
  },
  triaged: {
    label: 'Triaged',
    icon: ClipboardList,
    className:
      'text-status-triaged border-status-triaged/30 bg-status-triaged/10',
    awaitingClient: false,
  },
  quoted: {
    label: 'Quoted',
    icon: FileText,
    className: 'text-status-quoted border-status-quoted/30 bg-status-quoted/10',
    awaitingClient: true,
  },
  approved: {
    label: 'Approved',
    icon: CircleCheck,
    className:
      'text-status-approved border-status-approved/30 bg-status-approved/10',
    awaitingClient: false,
  },
  scheduled: {
    label: 'Scheduled',
    icon: CalendarCheck,
    className:
      'text-status-scheduled border-status-scheduled/30 bg-status-scheduled/10',
    awaitingClient: false,
  },
  in_progress: {
    label: 'In progress',
    icon: Wrench,
    className:
      'text-status-progress border-status-progress/30 bg-status-progress/10',
    awaitingClient: false,
  },
  work_complete: {
    label: 'Work complete',
    icon: CheckCheck,
    className:
      'text-status-work-complete border-status-work-complete/30 bg-status-work-complete/10',
    awaitingClient: true,
  },
  client_accepted: {
    label: 'Client accepted',
    icon: CircleCheck,
    className:
      'text-status-client-accepted border-status-client-accepted/30 bg-status-client-accepted/10',
    awaitingClient: false,
  },
  invoiced: {
    label: 'Invoiced',
    icon: Receipt,
    className:
      'text-status-invoiced border-status-invoiced/30 bg-status-invoiced/10',
    awaitingClient: true,
  },
  closed: {
    label: 'Closed',
    icon: CircleCheck,
    className: 'text-status-closed border-status-closed/30 bg-status-closed/10',
    awaitingClient: false,
  },
  on_hold: {
    label: 'On hold',
    icon: PauseCircle,
    className:
      'text-status-on-hold border-status-on-hold/30 bg-status-on-hold/10',
    awaitingClient: false,
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    className:
      'text-status-cancelled border-status-cancelled/30 bg-status-cancelled/10',
    awaitingClient: false,
  },
  declined: {
    label: 'Declined',
    icon: ThumbsDown,
    className:
      'text-status-declined border-status-declined/30 bg-status-declined/10',
    awaitingClient: false,
  },
}

/**
 * Presentation for a status that may not be in this build's vocabulary.
 *
 * The database enum is the source of truth and can gain a value in a migration
 * that ships before every open tab has reloaded. A bare
 * `JOB_STATUS_PRESENTATION[status]` types as total and returns undefined in
 * that window, crashing the row that contains it. This degrades to a readable
 * neutral chip instead.
 */
export function statusPresentation(status: string): StatusPresentation {
  // `| undefined` in the cast, not just `Record<string, StatusPresentation>`:
  // the whole point is that this key may be missing, and the narrower cast
  // would assert away the exact case being handled.
  const known = (
    JOB_STATUS_PRESENTATION as Record<string, StatusPresentation | undefined>
  )[status]
  if (known) return known
  return {
    label: status.replace(/_/g, ' '),
    icon: CircleDashed,
    className: 'text-muted-foreground border-border bg-muted',
    awaitingClient: false,
  }
}

/**
 * Imperative labels for the buttons that CAUSE a transition.
 *
 * Distinct from the status label on purpose: a button reading "Work complete"
 * is ambiguous about whether it reports or requests, and mis-clicking a status
 * change on a job with a client watching is expensive.
 */
const TRANSITION_VERB: Partial<Record<JobStatus, string>> = {
  requested: 'Submit request',
  triaged: 'Accept and triage',
  quoted: 'Mark quoted',
  approved: 'Mark approved',
  scheduled: 'Schedule',
  in_progress: 'Start work',
  work_complete: 'Mark work complete',
  client_accepted: 'Record client acceptance',
  invoiced: 'Mark invoiced',
  closed: 'Close job',
  on_hold: 'Put on hold',
  cancelled: 'Cancel job',
  declined: 'Decline',
}

export function transitionLabel(to: JobStatus): string {
  return TRANSITION_VERB[to] ?? `Move to ${JOB_STATUS_PRESENTATION[to].label}`
}

/**
 * Transitions that destroy work or are visible to the client the moment they
 * happen. The UI confirms these; everything else is one click.
 */
const DESTRUCTIVE: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'cancelled',
  'declined',
])

export function isDestructiveTransition(to: JobStatus): boolean {
  return DESTRUCTIVE.has(to)
}

export interface StatusTransition {
  from_status: JobStatus
  to_status: JobStatus
  actor_kind: string
}

/**
 * The legal state machine is a DATA TABLE in the database, not a constant
 * here, and this only reads it. Hardcoding the graph client-side would let the
 * UI offer an action the trigger then rejects with a check violation -- the
 * user sees a dead button and no explanation.
 */
export function allowedTransitions(
  transitions: ReadonlyArray<StatusTransition>,
  from: JobStatus,
  actorKind: ActorKind,
): Array<JobStatus> {
  return transitions
    .filter((row) => row.from_status === from && row.actor_kind === actorKind)
    .map((row) => row.to_status)
}

/**
 * Roles permitted to drive the lifecycle at all.
 *
 * Techs move only their own jobs, which `jobs_tech_update` enforces per row;
 * this is the coarse UI gate that decides whether to render the buttons.
 */
export function canTransitionJobs(role: string): boolean {
  return canDispatch(role)
}
