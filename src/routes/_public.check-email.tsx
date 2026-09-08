import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/_public/check-email')({
  validateSearch: z.object({ email: z.string().optional().catch(undefined) }),
  component: CheckEmailPage,
})

function CheckEmailPage() {
  const { email } = Route.useSearch()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          {email ? (
            <>
              We sent a sign-in link to <strong>{email}</strong>.
            </>
          ) : (
            'We sent you a sign-in link.'
          )}{' '}
          It expires in 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          to="/login"
          search={{ next: undefined }}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Use a different email
        </Link>
      </CardContent>
    </Card>
  )
}
