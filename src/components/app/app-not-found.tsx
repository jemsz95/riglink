import { Link } from '@tanstack/react-router'

export function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
      <p className="text-muted-foreground font-mono text-2xs tracking-widest uppercase">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground text-sm">
        That link may be broken, or the page may have moved.
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
