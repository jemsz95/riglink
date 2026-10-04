# riglink

Field service management with a client portal. Multi-tenant: many service
companies, each with their own clients, sites, jobs, quotes and invoices.

The lifecycle it exists to serve:

```
client request -> quote (materials + labour) -> client approves
  -> scheduled work -> field evidence (photos, receipts)
  -> client signs off + rates -> invoice -> accounting export
```

## Stack

| Layer        | Choice                                                          |
| ------------ | --------------------------------------------------------------- |
| App          | TanStack Router SPA (client-only; **not** TanStack Start)       |
| Build        | Vite 8 (Rolldown), TypeScript 6, React 19                       |
| Styling      | Tailwind CSS v4 (zero-config, no `tailwind.config`)             |
| Components   | shadcn/ui (new-york) over `radix-ui`, themed with custom tokens |
| Server state | TanStack Query                                                  |
| Forms        | TanStack Form + Zod 4                                           |
| Backend      | Supabase — Postgres 17, Auth, Storage, Edge Functions           |
| Design guide | Storybook 10                                                    |
| Tests        | Vitest (jsdom + browser projects), Playwright                   |

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the anon key from `npm run db:start`
npm run dev                    # http://localhost:3000
npm run storybook              # http://localhost:6006 -- the design guide
```

## Scripts

| Script                                        | Purpose                                          |
| --------------------------------------------- | ------------------------------------------------ |
| `dev` / `build` / `preview`                   | App                                              |
| `typecheck`                                   | `tsc --noEmit`                                   |
| `lint` / `format` / `check`                   | ESLint + Prettier                                |
| `test`                                        | Vitest **unit** project (jsdom) — runs anywhere  |
| `test:browser`                                | Vitest **browser** project — needs a real engine |
| `storybook` / `build-storybook`               | Design guide                                     |
| `ui:add -- <name>`                            | `shadcn add` followed by import normalisation    |
| `db:start` / `db:stop` / `db:reset`           | Local Supabase                                   |
| `db:new` / `db:types` / `db:test` / `db:push` | Migrations, types, pgTAP, deploy                 |

## Architecture notes

**Design tokens live in `src/styles.css`** in three blocks, and the split
matters:

1. `:root` / `.dark` — raw semantic values in oklch. Themes and per-tenant
   branding swap these.
2. `@theme inline { --color-*: var(--*) }` — the bridge. **`inline` is
   load-bearing.** Without it Tailwind resolves values at build time and dark
   mode silently stops working while every token still appears to exist.
   `.storybook/docs/tokens.browser.test.ts` guards this.
3. `@theme { … }` — static scales that do not vary by theme.

**Density is an ergonomics axis, not a theme.** `data-density="comfortable"` on
a wrapper widens `--size-touch` and `--row-height`; use `min-h-touch` and
`h-row` rather than hardcoded heights, or the field shell keeps office
ergonomics. Set it on a wrapper so a tablet can show a dense staff table beside
a comfortable field card.

**Authorization rides in the JWT.** A Supabase Custom Access Token Hook mints
`app_metadata.orgs` / `.clients` / `.epoch`, and every RLS policy reads claims
rather than querying membership tables. The accepted cost is that a token can
outlive a permission change; it is bounded by `jwt_expiry = 600` and made
immediate by a claim-epoch table whose freshness gate is folded into the RLS
accessor functions. Do not raise `jwt_expiry` without revisiting that.

**Money is integer cents everywhere** — database, UI, CSV export. Never a
float. One shared `computeTotals` serves quotes, invoices and the accounting
export so the three cannot disagree.

## Pinned versions, and why

Do not "helpfully" bump these without reading the reason.

| Package              | Pin            | Reason                                                                                                    |
| -------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `vitest`             | exact `4.1.11` | `@storybook/addon-vitest` peers `^3 \|\| ^4`, and `vitest@5` is published. Also enforced via `overrides`. |
| `@vitest/browser*`   | exact `4.1.11` | Must match `vitest`.                                                                                      |
| `storybook` / addons | `10.6.x`       | Vite 8 (Rolldown) support landed in 10.2.19; 9.x cannot build this project.                               |

Two conventions worth knowing before running `shadcn add`:

- The registry emits `import { cn } from "cn"` (a published package) and
  `useTheme` from `next-themes`. We keep `cn` local in `@/lib/utils` and own the
  theme in `@/lib/theme`, so `npm run ui:add` normalises imports afterwards.
  Running `npx shadcn add` directly will leave un-normalised imports — run
  `npm run ui:normalize` if you do.
- Only `@/*` is aliased to `src/`. The scaffold also had `#/*`; it was removed
  so there is one way to do it.

## Testing

`npm test` runs the jsdom project only, so it is green on any machine.
`npm run test:browser` needs a working Playwright Chromium — anything depending
on the CSS engine (oklch conversion, computed styles, the dark-mode regression
guard) lives there, because jsdom has no colour conversion and would report
false passes.

> On minimal container images without glib/X11 (and no package manager to add
> them), `test:browser` cannot run. That is an environment limitation, not a
> configuration problem; CI images with `playwright install --with-deps` are
> fine.
