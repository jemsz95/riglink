import { useState } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/**
 * The client's sign-off on finished work.
 *
 * Deliberately shaped like the quote approval panel, because it is the same
 * kind of moment: a decision with consequences, made by a customer, that the
 * contractor cannot make for them. Accepting is behind a confirmation;
 * declining asks why, because the note is the only thing that tells the
 * dispatcher whether to send a van or pick up the phone.
 *
 * The asymmetry is worth knowing while reading this: accepting moves the job,
 * declining does not. There is no client-side edge out of `work_complete` for
 * a rejection, on purpose -- a customer saying "not finished" is information
 * for a person, not a unilateral reopening. So the decline copy promises that
 * someone will be in touch rather than that anything has changed.
 */
export function SignoffPanel({
  pending,
  canDecide,
  onDecide,
}: {
  pending: boolean
  canDecide: boolean
  onDecide: (decision: 'approve' | 'decline', note: string | null) => void
}) {
  const [note, setNote] = useState('')

  return (
    <section className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="text-primary mt-0.5 size-5 shrink-0"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">The work is marked complete</h2>
          <p className="text-muted-foreground text-sm">
            Please confirm you are happy with it. Photos and notes from the
            visit are above.
          </p>
        </div>
      </div>

      {canDecide ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signoff-note">
              Anything to add?{' '}
              <span className="text-muted-foreground font-normal">
                (optional when accepting, please tell us if not)
              </span>
            </Label>
            <Textarea
              id="signoff-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Left the area tidy, all good."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={pending}>Accept the work</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Accept this work?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This confirms the job is finished to your satisfaction and
                    lets the contractor invoice it. We keep a record of exactly
                    what you were shown.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDecide('approve', note.trim() || null)}
                  >
                    Accept
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="outline"
              disabled={pending || note.trim() === ''}
              onClick={() => onDecide('decline', note.trim())}
            >
              Something is not right
            </Button>
          </div>
          {note.trim() === '' ? (
            <p className="text-muted-foreground text-2xs">
              To report a problem, add a note first so we know what to fix.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Only a main contact on this account can sign work off. Ask them to
          review it.
        </p>
      )}
    </section>
  )
}
