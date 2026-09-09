import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowLeft } from 'lucide-react'
import { Route as PortalRoute } from './portal.$orgSlug'
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
import { useSubmitJobRequest } from '@/features/portal/mutations'
import { portalSitesQuery } from '@/features/portal/queries'
import { useAppForm } from '@/lib/form/form-hook'
import { toUserMessage } from '@/lib/supabase/errors'

const NO_SITE = '__none__'

const schema = z.object({
  title: z.string().trim().min(1, 'Tell us briefly what you need.').max(200),
  description: z.string().trim().max(4000),
  site_id: z.string(),
  requested_for: z.string(),
})

export const Route = createFileRoute('/portal/$orgSlug/request')({
  component: RequestPage,
})

/**
 * The client's entry point into the whole lifecycle.
 *
 * Kept to four fields on purpose. Every extra field is a reason not to
 * finish, and staff triage the request afterwards anyway -- the job arrives
 * as `requested`, and it is their job to turn it into something quotable.
 */
function RequestPage() {
  const { clients } = PortalRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const navigate = useNavigate()

  const client = clients[0]
  const sites = useQuery(portalSitesQuery(client.client_id))
  const submit = useSubmitJobRequest()

  const form = useAppForm({
    defaultValues: {
      title: '',
      description: '',
      site_id: NO_SITE,
      requested_for: '',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        const job = await submit.mutateAsync({
          clientId: client.client_id,
          title: value.title.trim(),
          description: value.description.trim() || null,
          siteId: value.site_id === NO_SITE ? null : value.site_id,
          requestedFor: value.requested_for || null,
        })
        toast.success('Request sent')
        void navigate({
          to: '/portal/$orgSlug/jobs/$jobId',
          params: { orgSlug, jobId: job.id },
        })
      } catch (error) {
        toast.error(toUserMessage(error))
      }
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/portal/$orgSlug" params={{ orgSlug }}>
          <ArrowLeft className="size-4" aria-hidden />
          Your jobs
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Request work</CardTitle>
          <CardDescription>
            Describe what you need. You will get a quote to approve before any
            work starts.
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
            <form.AppField name="title">
              {(field) => (
                <field.TextField
                  label="What do you need?"
                  placeholder="Boiler making a knocking noise"
                />
              )}
            </form.AppField>

            <form.AppField name="description">
              {(field) => (
                <field.TextAreaField
                  label="Any detail that would help"
                  hint="optional"
                  rows={4}
                  placeholder="Started on Monday, worst first thing in the morning. Plant room on the second floor."
                />
              )}
            </form.AppField>

            <form.Field name="site_id">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="site">Which site?</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={field.handleChange}
                  >
                    <SelectTrigger id="site">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SITE}>
                        Not sure / not listed
                      </SelectItem>
                      {sites.data?.map((site) => (
                        <SelectItem key={site.id} value={site.id!}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="requested_for">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="requested_for">
                    Preferred date{' '}
                    <span className="text-muted-foreground font-normal">
                      — optional
                    </span>
                  </Label>
                  <Input
                    id="requested_for"
                    type="date"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    We will confirm a time with you rather than booking it
                    automatically.
                  </p>
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending…' : 'Send request'}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to="/portal/$orgSlug" params={{ orgSlug }}>
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
