import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme/theme-provider'

export const Route = createFileRoute('/')({ component: Home })

/**
 * Placeholder for the real entry point (Phase 1 redirects to the last-used org
 * or /login). Kept deliberately token-heavy so `npm run dev` doubles as a smoke
 * check that theming, density and the shadcn layer are all wired up.
 */
function Home() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
          Foundation ready
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">riglink</h1>
        <p className="text-muted-foreground text-sm">
          Field service management with a client portal. Routing, auth and the
          job lifecycle land next.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Theme</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(['light', 'dark', 'system'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={theme === option ? 'default' : 'outline'}
              onClick={() => setTheme(option)}
            >
              {option}
            </Button>
          ))}
          <span className="text-muted-foreground text-2xs">
            resolved: <code>{resolvedTheme}</code>
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Job lifecycle tokens</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ['Requested', 'bg-status-requested'],
            ['Quoted', 'bg-status-quoted'],
            ['Approved', 'bg-status-approved'],
            ['In progress', 'bg-status-progress'],
            ['Complete', 'bg-status-work-complete'],
            ['Invoiced', 'bg-status-invoiced'],
          ].map(([label, dot]) => (
            <span
              key={label}
              className="border-border bg-card inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs shadow-e1"
            >
              <span className={`size-2 rounded-full ${dot}`} />
              {label}
            </span>
          ))}
        </div>
        <p className="text-muted-foreground text-2xs">
          Full reference in the design guide: <code>npm run storybook</code>
        </p>
      </section>
    </div>
  )
}
