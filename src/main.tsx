import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/lib/theme/theme-provider'
import { createQueryClient } from '@/lib/query/query-client'
import { createAppRouter } from '@/router'
import { supabase } from '@/lib/supabase/client'
import { authStore, hydrateSession } from '@/lib/auth/session-store'

const queryClient = createQueryClient()

// Resolve the session BEFORE the router exists and the first frame paints.
// Without this the initial beforeLoad sees userId: null and bounces an
// already-signed-in user to /login.
await hydrateSession()

const router = createAppRouter({ queryClient })

supabase.auth.onAuthStateChange((event, session) => {
  authStore.setSession(session)

  // Never carry one identity's cache into another. Stale rows after a switch
  // look exactly like an RLS breach to a customer, even when they are not.
  if (event === 'SIGNED_OUT') {
    queryClient.clear()
  } else {
    void queryClient.invalidateQueries()
  }

  // Re-run every guard against the new snapshot.
  void router.invalidate()
})

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
