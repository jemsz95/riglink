import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Building2, Check, ChevronsUpDown, LifeBuoy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { membershipsQuery } from '@/features/orgs/queries'

export function OrgSwitcher() {
  const { orgSlug } = useParams({ strict: false })
  const navigate = useNavigate()
  const { data } = useQuery(membershipsQuery())

  const current = data?.orgs.find((org) => org.slug === orgSlug)
  const others = data?.orgs.filter((org) => org.slug !== orgSlug) ?? []
  const portals = data?.portal_clients ?? []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="min-h-touch w-full justify-between gap-2 px-2"
          aria-label="Switch workspace"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded text-2xs font-semibold">
              {(current?.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-sm font-medium">
              {current?.name ?? 'Select workspace'}
            </span>
          </span>
          <ChevronsUpDown
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-2xs uppercase tracking-wider">
          Companies
        </DropdownMenuLabel>
        {current ? (
          <DropdownMenuItem disabled className="justify-between">
            <span className="flex items-center gap-2">
              <Building2 className="size-4" aria-hidden />
              {current.name}
            </span>
            <Check className="size-4" aria-hidden />
          </DropdownMenuItem>
        ) : null}
        {others.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() =>
              void navigate({ to: '/$orgSlug', params: { orgSlug: org.slug } })
            }
          >
            <Building2 className="size-4" aria-hidden />
            {org.name}
          </DropdownMenuItem>
        ))}

        {portals.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-2xs uppercase tracking-wider">
              Client portals
            </DropdownMenuLabel>
            {portals.map((entry) => (
              <DropdownMenuItem
                key={entry.client_id}
                onSelect={() =>
                  void navigate({
                    to: '/portal/$orgSlug',
                    params: { orgSlug: entry.org_slug },
                  })
                }
              >
                <LifeBuoy className="size-4" aria-hidden />
                {entry.org_name}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding">
            <Plus className="size-4" aria-hidden />
            New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
