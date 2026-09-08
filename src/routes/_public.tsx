import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Chrome for unauthenticated screens: a centred card on a warm ground. No nav,
 * because there is nowhere to go until you are signed in.
 */
export const Route = createFileRoute('/_public')({
  component: PublicLayout,
})

function PublicLayout() {
  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-lg text-lg font-semibold">
            r
          </div>
          <h1 className="text-xl font-semibold tracking-tight">riglink</h1>
          <p className="text-muted-foreground text-sm">
            Field service management
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
