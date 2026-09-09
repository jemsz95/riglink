import { useEffect, useState } from 'react'

/**
 * Whether the browser believes it has a network.
 *
 * `navigator.onLine` is a weak signal -- it reports the link, not reachability,
 * so a van connected to a site's wifi with no route to the internet reads as
 * online. It is still worth having: the `online` event is the cheapest
 * possible trigger for draining the queue, and being wrong in the optimistic
 * direction costs one failed attempt and a backoff, which the queue already
 * handles. Being wrong pessimistically would strand a photo, so the app never
 * refuses to try on the strength of this alone.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
