import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatMoney } from '@/lib/format'

export interface ApprovalPanelProps {
  /** What the client is agreeing to, spelled out. */
  totalCents: number
  currency: string
  validUntil: string | null
  pending: boolean
  onDecide: (decision: 'approve' | 'decline', note: string | null) => void
  /** False for a `viewer` contact, who may read but not decide. */
  canDecide: boolean
}

/**
 * The approval moment.
 *
 * Deliberate friction on both paths: the total is restated inside the
 * confirmation, and declining asks for a reason. The reason is optional but
 * requested -- a decline with no explanation costs a phone call, and the
 * field is the cheapest place to capture it.
 *
 * Approving is not styled as a warning. It is the expected, positive action,
 * and dressing it in alarm colours trains people to ignore real warnings.
 */
export function ApprovalPanel({
  totalCents,
  currency,
  validUntil,
  pending,
  onDecide,
  canDecide,
}: ApprovalPanelProps) {
  const [open, setOpen] = useState<'approve' | 'decline' | null>(null)
  const [note, setNote] = useState('')

  const expired =
    validUntil != null &&
    new Date(validUntil) < new Date(new Date().toDateString())

  if (!canDecide) {
    return (
      <div className="border-border bg-muted/40 rounded-lg border p-4">
        <p className="text-sm font-medium">This quote needs approval</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Your access is read-only. Ask your main contact to approve or decline
          it.
        </p>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="border-border bg-muted/40 rounded-lg border p-4">
        <p className="text-sm font-medium">This quote has expired</p>
        <p className="text-muted-foreground mt-1 text-sm">
          It was valid until {formatDate(validUntil)}. Ask for an updated quote.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">
            Approve {formatMoney(totalCents, currency)} of work?
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {validUntil
              ? `This quote is valid until ${formatDate(validUntil)}.`
              : 'Approving lets the work be scheduled.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => setOpen('approve')}>
            <CheckCircle2 className="size-4" aria-hidden />
            Approve
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen('decline')}
          >
            <XCircle className="size-4" aria-hidden />
            Decline
          </Button>
        </div>
      </div>

      <AlertDialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(null)
            setNote('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {open === 'approve'
                ? `Approve ${formatMoney(totalCents, currency)}?`
                : 'Decline this quote?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {open === 'approve'
                ? 'This records your approval against the exact quote shown, with the date and your name. The work can then be scheduled.'
                : 'The company will be told you have declined. You can ask for a revised quote afterwards.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decision-note">
              {open === 'approve'
                ? 'Add a note or PO number (optional)'
                : 'Reason (optional, but it helps)'}
            </Label>
            <Textarea
              id="decision-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                open === 'approve'
                  ? 'PO 44812'
                  : 'Too expensive for this quarter'
              }
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (open) onDecide(open, note.trim() || null)
                setOpen(null)
                setNote('')
              }}
            >
              {open === 'approve' ? 'Yes, approve it' : 'Yes, decline it'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
