export function AppPending() {
  return (
    <div
      className="flex min-h-48 w-full items-center justify-center p-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      <div className="border-muted border-t-primary size-6 animate-spin rounded-full border-2" />
    </div>
  )
}
