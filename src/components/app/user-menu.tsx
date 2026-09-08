import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/lib/theme/theme-provider'
import { useAuth } from '@/lib/auth/session-store'
import { supabase } from '@/lib/supabase/client'

export function UserMenu() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-touch"
          aria-label="Account"
        >
          <span className="bg-secondary text-secondary-foreground flex size-7 items-center justify-center rounded-full text-2xs font-semibold">
            {(auth.email ?? '?').slice(0, 1).toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal">
          <span className="text-muted-foreground text-2xs">Signed in as</span>
          <br />
          {auth.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs uppercase tracking-wider">
          Theme
        </DropdownMenuLabel>
        {(['light', 'dark', 'system'] as const).map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => setTheme(option)}
            className={theme === option ? 'font-medium' : undefined}
          >
            {option}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void supabase.auth.signOut().then(() => navigate({ to: '/login' }))
          }}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
