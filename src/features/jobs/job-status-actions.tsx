import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import {
  JOB_STATUS_PRESENTATION,
  allowedTransitions,
  canTransitionJobs,
  isDestructiveTransition,
  transitionLabel,
} from './status'
import { useTransitionJob } from './mutations'
import { jobStatusTransitionsQuery } from './queries'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { JobStatus } from '@/lib/supabase/db'

export interface JobStatusActionsProps {
  orgId: string
  role: string
  jobId: string
  status: JobStatus
  onError: (error: unknown) => void
}

/**
 * Offers exactly the transitions the database will accept.
 *
 * The legal edges come from `job_status_transitions` -- the same table the
 * BEFORE UPDATE trigger checks -- filtered to `actor_kind = 'staff'`. Two
 * consequences worth stating:
 *
 * 1. Staff are never offered the client's approve/decline edges, so a staff
 *    member cannot record an approval on the client's behalf. That is the
 *    audit hole the actor_kind split exists to close.
 * 2. If a migration changes the graph, this UI changes with it and no client
 *    needs redeploying.
 */
export function JobStatusActions({
  orgId,
  role,
  jobId,
  status,
  onError,
}: JobStatusActionsProps) {
  const transitions = useQuery(jobStatusTransitionsQuery())
  const transitionJob = useTransitionJob(orgId)
  const [confirming, setConfirming] = useState<JobStatus | null>(null)

  if (!canTransitionJobs(role)) return null

  const next = allowedTransitions(transitions.data ?? [], status, 'staff')
  if (next.length === 0) return null

  const run = (to: JobStatus) => {
    transitionJob.mutate({ jobId, to }, { onError })
  }

  const [primary, ...rest] = next

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          onClick={() => {
            if (isDestructiveTransition(primary)) setConfirming(primary)
            else run(primary)
          }}
          disabled={transitionJob.isPending}
          variant={isDestructiveTransition(primary) ? 'destructive' : 'default'}
        >
          {transitionJob.isPending ? 'Saving…' : transitionLabel(primary)}
        </Button>

        {rest.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={transitionJob.isPending}
                aria-label="More status actions"
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {rest.map((to) => (
                <DropdownMenuItem
                  key={to}
                  variant={
                    isDestructiveTransition(to) ? 'destructive' : 'default'
                  }
                  onSelect={() => {
                    if (isDestructiveTransition(to)) setConfirming(to)
                    else run(to)
                  }}
                >
                  {transitionLabel(to)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming ? transitionLabel(confirming) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This moves the job to{' '}
              {confirming ? JOB_STATUS_PRESENTATION[confirming].label : ''} and
              records it in the job history, which cannot be edited or deleted.
              The client sees the change immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) run(confirming)
                setConfirming(null)
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
