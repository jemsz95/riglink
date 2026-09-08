import { Link } from '@tanstack/react-router'

export function AppNotFound({
  code = '404',
  title = 'Page not found',
  body = 'That link may be broken, or the page may have moved.',
}: {
  code?: string
  title?: string
  body?: string
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
      <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
        {code}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">{body}</p>
      <Link
        to="/"
        className="text-primary min-h-touch inline-flex items-center text-sm font-medium underline-offset-4 hover:underline"
      >
        Back to start
      </Link>
    </div>
  )
}
