import { Link } from '@tanstack/react-router'

/**
 * Shown in place of an entire workspace when a platform operator has suspended
 * it.
 *
 * DELIBERATELY CARRIES NO REASON. `org_suspensions.reason` is operator-facing
 * -- "non-payment, third notice", "fraud review" -- and lives in a table no
 * authenticated role holds any privilege on. Rendering it here would put an
 * unedited internal note on a customer's screen.
 *
 * This is a render-time short circuit, not a `beforeLoad` redirect, for two
 * reasons: the URL stays intact so a deep link still works once access is
 * restored, and every child route under the layout is blocked by construction
 * rather than by remembering to guard each one.
 */
export function AppSuspended({
  orgName,
  audience,
}: {
  orgName: string
  audience: 'staff' | 'portal'
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
      <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
        Suspended
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {audience === 'staff'
          ? `${orgName} is suspended`
          : 'This portal is unavailable'}
      </h1>
      <p className="text-muted-foreground text-sm">
        {audience === 'staff'
          ? 'This workspace has been suspended, so its jobs, customers and invoices are not available. Nothing has been deleted. Please contact support to restore access.'
          : `${orgName} cannot be reached through this portal at the moment. Please contact them directly.`}
      </p>
      <Link
        to="/"
        className="text-primary min-h-touch inline-flex items-center text-sm font-medium underline-offset-4 hover:underline"
      >
        Back to start
      </Link>
    </div>
  )
}
