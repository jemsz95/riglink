import { Link, useParams } from '@tanstack/react-router'
import {
  Briefcase,
  Download,
  Building2,
  FileText,
  LayoutDashboard,
  MapPin,
  Receipt,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { OrgSwitcher } from './org-switcher'
import { UserMenu } from './user-menu'
import { cn } from '@/lib/utils'

const NAV = [
  {
    to: '/$orgSlug' as const,
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  { to: '/$orgSlug/jobs' as const, label: 'Jobs', icon: Briefcase },
  { to: '/$orgSlug/clients' as const, label: 'Clients', icon: Building2 },
  { to: '/$orgSlug/sites' as const, label: 'Sites', icon: MapPin },
  { to: '/$orgSlug' as const, label: 'Quotes', icon: FileText, disabled: true },
  { to: '/$orgSlug/invoices' as const, label: 'Invoices', icon: Receipt },
  { to: '/$orgSlug/exports' as const, label: 'Exports', icon: Download },
]

type NavTarget = (typeof NAV)[number]['to']

/**
 * Staff shell: sidebar on md+, bottom bar below. Density stays `compact` here
 * -- office users are in this all day and more rows visible means fewer
 * scrolls. The field shell opts into `comfortable` instead.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams({ strict: false })

  return (
    <div className="bg-background flex min-h-dvh flex-col md:flex-row">
      <aside className="border-border bg-sidebar hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="border-border border-b p-2">
          <OrgSwitcher />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main">
          {NAV.map((item) => (
            <NavItem key={item.label} {...item} orgSlug={orgSlug} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-card/80 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-4 py-2 backdrop-blur">
          <div className="min-w-0 md:hidden">
            <OrgSwitcher />
          </div>
          <div className="hidden md:block" />
          <UserMenu />
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>

        <nav
          className="border-border bg-card sticky bottom-0 flex items-stretch justify-around border-t md:hidden"
          aria-label="Main"
        >
          {NAV.slice(0, 4).map((item) => (
            <BottomItem key={item.label} {...item} orgSlug={orgSlug} />
          ))}
        </nav>
      </div>
    </div>
  )
}

interface NavItemProps {
  to: NavTarget
  label: string
  icon: typeof LayoutDashboard
  orgSlug?: string
  exact?: boolean
  disabled?: boolean
}

function NavItem({
  to,
  label,
  icon: Icon,
  orgSlug,
  exact,
  disabled,
}: NavItemProps) {
  const base =
    'min-h-touch flex items-center gap-2 rounded-md px-2 text-sm transition-colors'

  if (disabled || !orgSlug) {
    return (
      <span
        aria-disabled
        title="Arrives in a later phase"
        className={cn(base, 'text-muted-foreground/50 cursor-not-allowed')}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </span>
    )
  }

  return (
    <Link
      to={to}
      params={{ orgSlug }}
      activeOptions={{ exact }}
      className={cn(base, 'text-sidebar-foreground hover:bg-sidebar-accent')}
      activeProps={{ className: 'bg-sidebar-accent font-medium' }}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  )
}

function BottomItem({
  to,
  label,
  icon: Icon,
  orgSlug,
  exact,
  disabled,
}: NavItemProps) {
  const base =
    'min-h-touch flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-2xs'

  if (disabled || !orgSlug) {
    return (
      <span aria-disabled className={cn(base, 'text-muted-foreground/50')}>
        <Icon className="size-5" aria-hidden />
        {label}
      </span>
    )
  }

  return (
    <Link
      to={to}
      params={{ orgSlug }}
      activeOptions={{ exact }}
      className={cn(base, 'text-muted-foreground')}
      activeProps={{ className: 'text-primary font-medium' }}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  )
}
