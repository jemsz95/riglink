import { toUserMessage } from '@/lib/supabase/errors'
import { Button } from '@/components/ui/button'

/**
 * Route-level error boundary. Deliberately keeps the surrounding shell intact
 * where possible so a user can navigate away instead of hitting a dead end.
 */
export function AppError({
  error,
  reset,
}: {
  error: unknown
  reset?: () => void
}) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto my-8 flex max-w-md flex-col items-start gap-3 rounded-lg border p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight">
        Something went wrong
      </h2>
      <p className="text-muted-foreground text-sm">{toUserMessage(error)}</p>
      {reset ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-touch"
          onClick={reset}
        >
          Try again
        </Button>
      ) : null}
    </div>
  )
}
