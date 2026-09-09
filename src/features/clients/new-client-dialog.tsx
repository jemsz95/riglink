import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useCreateClient } from './mutations'
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
  name: z.string().trim().min(1, 'A client needs a name.').max(200),
  // Not `.email()` on an empty string: the field is optional, and rejecting ''
  // would make the form unsubmittable until something is typed and deleted.
  billing_email: z.union([
    z.literal(''),
    z.string().email('Not a valid email.'),
  ]),
  phone: z.string().trim().max(50),
})

export function NewClientDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const createClient = useCreateClient(orgId)

  const form = useAppForm({
    defaultValues: { name: '', billing_email: '', phone: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await createClient.mutateAsync({
          name: value.name.trim(),
          billing_email: value.billing_email.trim() || null,
          phone: value.phone.trim() || null,
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
        <Button>
          <Plus className="size-4" aria-hidden />
          New client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>
              The company you invoice. Sites and portal contacts hang off it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name"
                  placeholder="Northgate Properties"
                />
              )}
            </form.AppField>
            <form.AppField name="billing_email">
              {(field) => (
                <field.TextField label="Billing email" type="email" />
              )}
            </form.AppField>
            <form.AppField name="phone">
              {(field) => <field.TextField label="Phone" type="tel" />}
            </form.AppField>
          </div>

          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Adding…' : 'Add client'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
