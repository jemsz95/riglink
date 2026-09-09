/**
 * WCAG 2.4.1. Lets a keyboard user reach the page without tabbing the nav.
 *
 * Visually hidden until focused rather than always visible: it is the first
 * thing in the tab order on every page, and a permanently visible link there
 * is clutter for the 99% of users who will never press Tab. `sr-only` alone
 * would leave it unreachable to a sighted keyboard user, which is the person
 * it is actually for -- hence the `focus:` overrides that bring it back into
 * the layout.
 *
 * The target must be focusable, so `<main>` carries `tabIndex={-1}`:
 * without it, browsers move the viewport but leave focus on the link, and the
 * next Tab returns to the sidebar the user just skipped.
 */
export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-2 focus-visible:outline-none"
    >
      Skip to content
    </a>
  )
}
