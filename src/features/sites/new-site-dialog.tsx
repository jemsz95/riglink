import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useCreateSite } from '@/features/clients/mutations'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAppForm } from '@/lib/form/form-hook'
import { toUserMessage } from '@/lib/supabase/errors'

const schema = z.object({
  name: z.string().trim().min(1, 'A site needs a name.').max(200),
  line1: z.string().trim().max(200),
  city: z.string().trim().max(120),
  postcode: z.string().trim().max(30),
  timezone: z.string().trim().max(60),
  access_notes: z.string().trim().max(2000),
  site_contact_name: z.string().trim().max(200),
  site_contact_phone: z.string().trim().max(50),
})

export function NewSiteDialog({
  orgId,
  clientId,
  clientName,
}: {
  orgId: string
  clientId: string
  clientName: string
}) {
  const [open, setOpen] = useState(false)
  const createSite = useCreateSite(orgId)

  const form = useAppForm({
    defaultValues: {
      name: '',
      line1: '',
      city: '',
      postcode: '',
      // Prefilled from the browser so the common case needs no thought.
      // Per-SITE rather than per-org because a site in another zone otherwise
      // renders every scheduled time at the wrong local hour.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      access_notes: '',
      site_contact_name: '',
      site_contact_phone: '',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const address = {
        ...(value.line1.trim() ? { line1: value.line1.trim() } : {}),
        ...(value.city.trim() ? { city: value.city.trim() } : {}),
        ...(value.postcode.trim() ? { postcode: value.postcode.trim() } : {}),
      }
      try {
        await createSite.mutateAsync({
          client_id: clientId,
          name: value.name.trim(),
          // An empty jsonb object is not "no address" -- it is a value that
          // renders as a blank line. Absent data is NULL.
          address: Object.keys(address).length > 0 ? address : null,
          timezone: value.timezone.trim() || null,
          access_notes: value.access_notes.trim() || null,
          site_contact_name: value.site_contact_name.trim() || null,
          site_contact_phone: value.site_contact_phone.trim() || null,
        })
        toast.success(`${value.name.trim()} added`)
        setOpen(false)
        form.reset()
      } catch (error) {
        toast.error(toUserMessage(error))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" aria-hidden />
          Add site
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>New site for {clientName}</DialogTitle>
            <DialogDescription>
              A location you service. Access notes stay internal and are never
              shown in the client portal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Site name"
                  placeholder="Unit 4, Mill Yard"
                />
              )}
            </form.AppField>
            <form.AppField name="line1">
              {(field) => <field.TextField label="Address line" />}
            </form.AppField>
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="city">
                {(field) => <field.TextField label="City" />}
              </form.AppField>
              <form.AppField name="postcode">
                {(field) => <field.TextField label="Postcode" />}
              </form.AppField>
            </div>
            <form.AppField name="timezone">
              {(field) => (
                <field.TextField
                  label="Timezone"
                  hint="used for this site's scheduled times"
                />
              )}
            </form.AppField>
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="site_contact_name">
                {(field) => <field.TextField label="Site contact" />}
              </form.AppField>
              <form.AppField name="site_contact_phone">
                {(field) => (
                  <field.TextField label="Contact phone" type="tel" />
                )}
              </form.AppField>
            </div>
            <form.AppField name="access_notes">
              {(field) => (
                <field.TextAreaField
                  label="Access notes"
                  hint="internal only"
                  rows={2}
                  placeholder="Gate code 4821, key safe by the loading bay"
                />
              )}
            </form.AppField>
          </div>

          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Adding…' : 'Add site'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
