import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { canAdminister } from '@/features/orgs/permissions'
import {
  orgMembersQuery,
  orgSettingsQuery,
} from '@/features/orgs/members-queries'
import { useUpdateOrgSettings } from '@/features/orgs/settings-mutations'
import { useAppForm } from '@/lib/form/form-hook'
import { formatDate } from '@/lib/format'

export const Route = createFileRoute('/$orgSlug/_staff/settings')({
  component: SettingsPage,
})

/**
 * Org settings and the team list.
 *
 * The fields here are the ones that change downstream documents -- currency,
 * tax rate, invoice prefix and terms -- so each says what it affects rather
 * than just what it is. A tax rate field with no explanation is a field
 * somebody guesses at.
 */
function SettingsPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const members = useQuery(orgMembersQuery(org.id))
  const settings = useQuery(orgSettingsQuery(org.id))
  const update = useUpdateOrgSettings(org.id)

  const form = useAppForm({
    // Seeded from the loaded row, never from constants. A form defaulting to
    // `invoice_prefix: 'INV-'` and `terms: 30` would overwrite whatever the
    // org had set the first time anyone pressed Save on an unrelated field.
    // The form is not rendered until this resolves, which is what makes the
    // non-null assertion below honest.
    defaultValues: {
      name: settings.data?.name ?? org.name,
      timezone: settings.data?.timezone ?? org.timezone,
      currency: settings.data?.currency ?? org.currency,
      // Held as a string end to end: the column is `numeric` and a rate that
      // has been through a double is a rate that can be a cent out.
      default_tax_rate: settings.data?.default_tax_rate ?? '0',
      invoice_prefix: settings.data?.invoice_prefix ?? '',
      invoice_terms_days: settings.data?.invoice_terms_days ?? 30,
    },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync(value)
        toast.success('Settings saved')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save')
      }
    },
  })

  if (!canAdminister(role)) {
    return (
      <EmptyState
        title="You cannot change settings"
        body="Organisation settings are managed by owners and admins."
      />
    )
  }

  if (settings.isError) {
    return (
      <AppError error={settings.error} reset={() => void settings.refetch()} />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Press{' '}
          <kbd className="border-border bg-muted rounded border px-1 font-mono text-2xs">
            ⌘K
          </kbd>{' '}
          anywhere to jump to a job.
        </p>
      </header>

      {settings.isPending ? (
        <div className="flex max-w-xl flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : (
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <h2 className="text-sm font-medium">Organisation</h2>

          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Appears on quotes, invoices and in the client portal.
                </p>
              </div>
            )}
          </form.Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="timezone">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="org-tz">Timezone</Label>
                  <Input
                    id="org-tz"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Used when a site has none of its own. A site&apos;s timezone
                    always wins.
                  </p>
                </div>
              )}
            </form.Field>

            <form.Field name="currency">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="org-currency">Currency</Label>
                  <Input
                    id="org-currency"
                    value={field.state.value}
                    maxLength={3}
                    onChange={(event) =>
                      field.handleChange(event.target.value.toUpperCase())
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    Set on each quote and invoice when it is raised. Changing it
                    does not restate existing documents.
                  </p>
                </div>
              )}
            </form.Field>
          </div>

          <h2 className="mt-2 text-sm font-medium">Invoicing</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <form.Field name="invoice_prefix">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-prefix">Invoice prefix</Label>
                  <Input
                    id="inv-prefix"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="invoice_terms_days">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-terms">Payment terms (days)</Label>
                  <Input
                    id="inv-terms"
                    type="number"
                    min={0}
                    max={180}
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(Number(event.target.value))
                    }
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="default_tax_rate">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tax-rate">Default tax rate</Label>
                  <Input
                    id="tax-rate"
                    // `inputMode`, not `type="number"`: a number input strips
                    // trailing decimals mid-typing, so "0.0825" is unreachable
                    // one keystroke at a time. Same reason MoneyInput does it.
                    inputMode="decimal"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    A decimal, so 8.25% is <code>0.0825</code>.
                  </p>
                </div>
              )}
            </form.Field>
          </div>

          <div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Team</h2>
        {members.isError ? (
          <AppError
            error={members.error}
            reset={() => void members.refetch()}
          />
        ) : members.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="flex max-w-xl flex-col gap-2">
            {members.data.map((member) => (
              <li
                key={member.user_id}
                className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {member.full_name ?? 'Invitation pending'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {member.accepted_at
                      ? `Joined ${formatDate(member.accepted_at, org.timezone)}`
                      : `Invited ${formatDate(member.invited_at, org.timezone)}`}
                  </span>
                </div>
                <Badge variant="outline">{member.role}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground max-w-xl text-xs">
          Names come from each person&apos;s own profile. Someone who has been
          invited but has not signed in yet has no name to show, which is why
          the row says so rather than guessing one.
        </p>
      </section>
    </div>
  )
}
