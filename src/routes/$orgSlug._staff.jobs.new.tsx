import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowLeft } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { clientOptionsQuery } from '@/features/clients/queries'
import { sitesForClientQuery } from '@/features/sites/queries'
import { useCreateJob } from '@/features/jobs/mutations'
import { canTransitionJobs } from '@/features/jobs/status'
import { toUserMessage } from '@/lib/supabase/errors'
import { EmptyState } from '@/components/app/empty-state'
import type { JobPriority } from '@/lib/supabase/db'

const NO_SITE = '__none__'

const newJobSchema = z.object({
  client_id: z.string().uuid('Choose the client this job is for.'),
  site_id: z.string().uuid().nullable(),
  title: z.string().trim().min(1, 'Give the job a short title.').max(200),
  description: z.string().trim().max(4000),
  priority: z.enum(['low', 'normal', 'high', 'emergency']),
  requested_for: z.string(),
  internal_notes: z.string().trim().max(4000),
})

export const Route = createFileRoute('/$orgSlug/_staff/jobs/new')({
  component: NewJobPage,
})

function NewJobPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const navigate = useNavigate()

  const clients = useQuery(clientOptionsQuery(org.id))
  const createJob = useCreateJob(org.id)

  const form = useForm({
    defaultValues: {
      client_id: '',
      site_id: null as string | null,
      title: '',
      description: '',
      // Typed as the enum, not the literal 'normal': inferring the literal
      // makes the Zod schema's wider union unassignable to the form's values.
      priority: 'normal' as JobPriority,
      requested_for: '',
      internal_notes: '',
    },
    validators: { onSubmit: newJobSchema },
    onSubmit: async ({ value }) => {
      try {
        const job = await createJob.mutateAsync({
          client_id: value.client_id,
          site_id: value.site_id,
          title: value.title.trim(),
          // Empty strings are not "no description" in SQL -- they are a value
          // that sorts and matches. Absent data is NULL.
          description: value.description.trim() || null,
          priority: value.priority,
          requested_for: value.requested_for || null,
          internal_notes: value.internal_notes.trim() || null,
        })
        toast.success(`Job #${job.number} created`)
        void navigate({
          to: '/$orgSlug/jobs/$jobId',
          params: { orgSlug, jobId: job.id },
        })
      } catch (error) {
        toast.error(toUserMessage(error))
      }
    },
  })

  // The insert policy admits owner/admin/dispatcher only. Showing a form that
  // RLS will refuse teaches users to distrust the app.
  if (!canTransitionJobs(role)) {
    return (
      <EmptyState
        title="You cannot create jobs"
        body="Ask an owner or admin for dispatcher access."
        action={
          <Button asChild variant="outline">
            <Link to="/$orgSlug/jobs" params={{ orgSlug }}>
              Back to jobs
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/$orgSlug/jobs" params={{ orgSlug }}>
          <ArrowLeft className="size-4" aria-hidden />
          Jobs
        </Link>
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New job</CardTitle>
          <CardDescription>
            Created as a draft, so nothing is visible to the client until you
            move it forward.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.Field name="client_id">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client">Client</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value)
                      // A site belongs to one client. Keeping the old site
                      // would violate the composite FK on insert.
                      form.setFieldValue('site_id', null)
                    }}
                  >
                    <SelectTrigger id="client">
                      <SelectValue placeholder="Choose a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.data?.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={field.state.meta.errors} />
                  {clients.data?.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No clients yet.{' '}
                      <Link
                        to="/$orgSlug/clients"
                        params={{ orgSlug }}
                        className="underline"
                      >
                        Add one first
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field name="site_id">
              {(siteField) => (
                <form.Subscribe selector={(state) => state.values.client_id}>
                  {(clientId) => (
                    <SiteField
                      clientId={clientId}
                      value={siteField.state.value}
                      onChange={siteField.handleChange}
                    />
                  )}
                </form.Subscribe>
              )}
            </form.Field>

            <form.Field name="title">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Annual boiler service"
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">
                    Description{' '}
                    <span className="text-muted-foreground font-normal">
                      — visible to the client
                    </span>
                  </Label>
                  <Textarea
                    id="description"
                    rows={3}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="priority">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        field.handleChange(value as typeof field.state.value)
                      }}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <form.Field name="requested_for">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="requested_for">Requested for</Label>
                    <Input
                      id="requested_for"
                      type="date"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="internal_notes">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="internal_notes">
                    Internal notes{' '}
                    <span className="text-muted-foreground font-normal">
                      — never shown to the client
                    </span>
                  </Label>
                  <Textarea
                    id="internal_notes"
                    rows={2}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating…' : 'Create job'}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to="/$orgSlug/jobs" params={{ orgSlug }}>
                      Cancel
                    </Link>
                  </Button>
                </div>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function SiteField({
  clientId,
  value,
  onChange,
}: {
  clientId: string
  value: string | null
  onChange: (siteId: string | null) => void
}) {
  const { org } = OrgRoute.useRouteContext()
  const sites = useQuery(sitesForClientQuery(org.id, clientId || null))

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="site">Site</Label>
      <Select
        value={value ?? NO_SITE}
        disabled={!clientId}
        onValueChange={(next) => {
          onChange(next === NO_SITE ? null : next)
        }}
      >
        <SelectTrigger id="site">
          <SelectValue
            placeholder={clientId ? 'Choose a site' : 'Choose a client first'}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SITE}>No specific site</SelectItem>
          {sites.data?.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FieldError({
  errors,
}: {
  errors: Array<{ message?: string } | undefined>
}) {
  const message = errors[0]?.message
  if (!message) return null
  return (
    <p className="text-destructive text-xs" role="alert">
      {message}
    </p>
  )
}
