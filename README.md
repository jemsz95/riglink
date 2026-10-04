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

## Provisioning

There are **no dashboard-only steps**. Schema lives in
`supabase/migrations/`, and auth configuration — including the access-token
hook that all authorization depends on — lives in `supabase/config.toml`:

```bash
supabase login && supabase link --project-ref <ref>
npm run deploy      # db push + config push as one unit
npm run db:types
```

Schema and auth config are a single deployment unit — `npm run deploy` pushes
both so they cannot diverge. Pushing migrations without config leaves the hook
function present but not invoked, which is the one way to half-deploy.

`npm run config:diff` shows what a push would change; it is authoritative, so
a setting changed in the dashboard and not mirrored in `config.toml` gets
reverted on the next push.

Full detail, including verification steps: **`supabase/BOOTSTRAP.md`**.

## Getting started

```bash
npm install
npm run dev                    # http://localhost:3000, against the production project
npm run storybook              # http://localhost:6006 -- the design guide
```

`.env` is committed with the production project's URL and publishable key,
both public by design. To work against a local stack (`npm run db:start`),
put its values in `.env.development.local`, which overrides `.env` for
`npm run dev` only, so builds keep production values.

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

**Query keys are org-scoped from the first segment**, built only by the
factories in `src/features/*/keys.ts` — `['org', orgId, 'jobs', …]`. This makes
cross-tenant cache bleed structurally impossible and org switching a single
invalidation. `no-restricted-syntax` in `eslint.config.js` rejects inline
`queryKey` array literals outside those files, because stale rows from another
tenant after a switch are indistinguishable from an RLS breach to the customer
looking at the screen.

**Tables sort and page on the server, and the URL owns that state.** TanStack
Table v9 runs with `manualSorting` / `manualPagination` (set once in
`src/components/app/data-table/table-hook.ts`); the flags tell the table its
`data` is already the requested page in the requested order, so it must not
re-sort or slice. Sort and page live in search params so a filtered view is
linkable and the back button undoes a sort. Sortable column ids are the
database column names and are whitelisted in `filters.ts` — the value reaches
PostgREST's `order`, and ordering by an arbitrary column is an oracle over one
the portal never shows.

**Realtime needs the publication, not just a subscription.** A
`postgres_changes` channel on a table that is not in `supabase_realtime`
subscribes successfully and delivers nothing — a live-looking dashboard showing
stale data. `20260909145552_realtime_jobs.sql` publishes `jobs` and
`job_status_events`. Replica identity stays `DEFAULT` deliberately: `FULL`
would put `internal_notes` into `old_record`, which Realtime sends to
subscribers.

**The arithmetic is defined in SQL and mirrored in TypeScript.** Line totals
and per-line tax are `GENERATED … STORED` columns; header totals are derived
from the lines by trigger and recomputed on every header write, so a client
that PATCHes `total_cents` has it overwritten rather than trusted.
`src/features/quotes/totals.ts` mirrors those formulas, and its tests assert
agreement against expectations generated by **Postgres itself**
(`totals.fixtures.ts`) rather than by this codebase. Two properties of
`numeric` make a naive port wrong, and both are covered: `round()` is half
_away from zero_ (`round(-2.5) = -3`, but `Math.round(-2.5) = -2`, and discount
lines are negative), and `numeric` is exact decimal (`round(1.005 * 100) = 101`
in Postgres, `100` in JS). Hence BigInt arithmetic and no `parseFloat`
anywhere in `features/quotes`.

**A sent quote is frozen.** `locked_at` is set in the same statement as the
status, and a trigger — not a policy — rejects any line change afterwards, so
even an owner and even a definer RPC cannot edit it. `approvals.snapshot`
freezes exactly what the client saw, and `approvals` has no UPDATE or DELETE
policy for anyone. Evidence that can be edited is not evidence.

**The portal reads views, never base tables.** `portal_job_v`,
`portal_site_v`, `portal_quote_v` and `portal_quote_line_v` are column
projections carrying `with (security_invoker = on)`; the view narrows columns
(`internal_notes`, `access_notes`, `internal_note` do not exist in them) while
RLS on the base table narrows rows. Both halves are required — a view alone
would show every tenant, a policy alone would show staff-only columns. The
pre-PG15 default runs a view as its owner and silently bypasses RLS, so that
flag is mandatory on every view in this project.

**Techs are excluded from money by having no policy at all.** Supabase has a
single `authenticated` role, so per-column grants cannot distinguish a tech
from an admin. No policy on `quotes`, `quote_line_items`, `catalog_items` or
`approvals` mentions `app.staff_orgs()` — they all use
`app.orgs_with_role(['owner','admin','dispatcher'])`, and a tech consequently
reads nothing from them while still seeing the job.

**The platform tier can manage organisations and cannot read them.** The
first user on an empty deployment becomes a platform operator
(`public.platform_admins`): they onboard new contractors and can suspend an
organisation. The guarantee that keeps that safe is an absence, stated the same
way the techs-and-money one is: **no RLS policy in this schema mentions
`app.is_platform_admin()`**, so an operator querying `jobs` or `clients`
directly gets exactly what their own memberships permit — nothing, for an
operator who is a member of none. Every platform power is a named
`public.platform_*` RPC returning a hand-written projection, so the complete
list of what they can see is one migration long. It is checkable:
`select * from pg_policies where qual ~ 'is_platform_admin'` must be empty. No
RPC writes `org_members`, and `platform_invite_founder()` takes no `org_id` at
all — which is what makes "an operator cannot let themselves into a tenant"
structural rather than a rule. Adding one is not a claim: it is read from the
table on every call, so revoking it takes effect on the next request rather
than being stale for up to `jwt_expiry`, and it costs no `claims_version` bump.

**Suspension is enforced in the accessors, and the flag is not a column.** The
obvious shape — `organizations.suspended_at` — does not work, because
`organizations_admin_update` is a _row_ policy and RLS filters rows, not
columns, so an owner could clear their own suspension. State lives only in
`public.org_suspensions`, which has RLS on, zero policies and zero grants.
`app.staff_orgs()`, `app.orgs_with_role()`, `app.portal_clients()` and
`app.portal_orgs()` keep their signatures and subtract suspended orgs, so every
table policy, the storage policies, Realtime and the overflow branch are
covered without one policy being edited. Two paths do not route through an
accessor and are fixed by name: `app.portal_contact_for()` (the guard for all
five portal write RPCs) and `profiles_org_mates_select`. Sign-in still works —
a user who belongs to two orgs must keep working in the healthy one — and the
`organizations` row stays readable to its own members so the app can say
"suspended" instead of "not found". The reason is operator-facing and never
reaches the tenant. Baking it into the claims was rejected: it misses the
overflow branch and `portal_contact_for` entirely, needs an unbounded epoch
fan-out on both suspend and restore, and would cost a second claim.

**An organisation has exactly one owner, at every commit boundary.** `<= 1` is
`org_members_one_owner_per_org`, a partial unique index; `>= 1` is a
`DEFERRABLE INITIALLY DEFERRED` constraint trigger. Deferred is what makes
`delete from organizations` still possible and what removes the need for a
transaction-local flag — the RPC's demote-then-promote simply passes at commit.
An owner therefore cannot be demoted or deleted by anyone including themselves;
`public.transfer_ownership()` is the only exit, and it makes the outgoing owner
an `admin`. It is `SECURITY DEFINER` out of necessity, not convenience: as
invoker, the demote fires `org_members_bump_epoch`, and the promote's accessor
then reads the caller's own uncommitted bump and raises `P0001` against them —
so it would fail on its second statement every time. That trap applies to any
invoker RPC that writes `org_members` or `client_contacts` and then reads
anything RLS-protected. The statement order is load-bearing too: a unique
_index_ is never deferrable, so two owners must not exist even between two
statements of one transaction.

**Grants are explicit, and `anon` has none.** `auto_expose_new_tables = false`
in `config.toml` states the intent but does not implement it: a Supabase
project carries `alter default privileges in schema public grant all on tables
to anon, authenticated, service_role`, which survives a `config push`. Every
table therefore arrived with all eight privileges for `anon` — the Phase 3
quote tables included, whose migration granted precisely and said nothing
about `anon`, so its explicit grant was a no-op next to a default that had
already granted everything. RLS still denied every row, so nothing was
exposed, but the second lock was not fitted. The default ACL is now rewritten,
`anon` holds nothing anywhere, and `authenticated` is granted one verb at a
time per table to match the policies that exist. A table needs two independent
mistakes — a grant _and_ a policy — to leak.

**New functions are closed by an event trigger, because they cannot be closed
by default privileges.** `alter default privileges ... revoke execute on
functions from public` is accepted and `pg_default_acl` afterwards shows no
PUBLIC entry, yet the next function created still comes out with `=X` on it:
Postgres unions the stored default with the built-in world default for
functions. `PUBLIC` includes `anon`, so a new definer RPC in `public` is born
callable by anyone with the publishable key. `app.revoke_public_execute()`,
an event trigger on `CREATE`/`ALTER FUNCTION`, strips it. Explicit grants are
untouched, so `grant execute ... to authenticated` on the next line still
works and remains the only way a client reaches an RPC.

**Multi-step writes are RPCs, because PostgREST gives each request its own
transaction.** `save_quote_draft` and `supersede_quote` exist for atomicity,
not tidiness. As client-side sequences they were three and four separate
requests, and the save path deleted lines first — so a dropped connection
mid-sequence left a quote with its lines destroyed and nothing put back, on an
800ms autosave, unattended. Both are `SECURITY INVOKER`: staff already hold
the policies, so RLS and the quote-lock trigger decide exactly as they did
before. `save_quote_draft` also takes the line array as the whole instruction
and deletes what is absent, which retired a client-side `removedIds` diff that
could not see a line added and deleted within one session and left it behind as
an orphan.

### Row-shaped vs field-shaped sensitivity — the standard

One constraint drives every decision on the client-facing surface, and it does
not bend: **RLS filters rows, not columns**, and Supabase has a single
`authenticated` role. So if an audience has RLS row access to a table, it can
read _every column_ of the rows it can see. A view cannot fix that — the base
table is still there, and a `security_invoker` view checks the caller's own
grants on it, so you cannot close the table underneath without breaking the
view for everyone.

That leaves exactly two patterns, and which one applies is decided by the
**shape of the sensitivity**, not by taste:

| The sensitivity is…                                               | Pattern                                                                                                                              | Examples                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Row-shaped** — the whole row is either shareable or it is not   | A discriminator column on the row, enforced by the RLS policy. The view is then only a column projection, not the security boundary. | `job_evidence.client_visible`, `jobs.status <> 'draft'`, `quotes.status <> 'draft'`, `quote_line_items` hidden while its parent quote is a draft |
| **Field-shaped** — the row must be visible but one field must not | The field moves to a staff-only side table with its own policies.                                                                    | `job_internal_notes`, `client_internal_notes`, `site_access_notes`, `quote_internal_notes`                                                       |

These are not two answers to the same question. A photo is either shown to the
client or it is not — there is no half-visible photo, so `client_visible` is
the right model and a side table would be absurd. A job, by contrast, _must_ be
visible to the client who requested it while `internal_notes` must not, and no
row predicate can express that, because the row has to be returned.

So the decision procedure for any new staff-only data is one question: **can
the whole row be hidden?** If yes, a discriminator. If no, a side table.

**The one accepted exception.** An opaque identifier carrying no personal or
commercial information may stay on a client-visible row rather than moving:
`jobs.lead_tech_id`, `jobs.created_by`, `job_evidence.captured_by`,
`clients.created_by`, `sites.created_by`, `quotes.created_by`,
`quote_line_items.catalog_item_id`. The client learns that _someone_ is
assigned, and nothing else — no name, no email, no amount, no note, no
decision. Anything carrying one of those does not qualify and takes the side
table. Every one of these is listed in `supabase/portal-exposure.json` with
that reasoning attached.

**What we rejected, and why.** An owner-rights (`security_invoker = off`)
portal view with the tenant predicate inside it also closes the leak, in one
migration, with no schema surgery — and we shipped it briefly. It was reverted
because it reduces the portal read path to a single lock: the view's `WHERE`
clause, with no RLS beneath it, so one bad predicate is a cross-tenant leak
rather than a defect caught by a second mechanism. It also raises
`0010_security_definer_view`, which splinter's source emits at **ERROR** (the
docs page saying WARN is stale) and which has no suppression mechanism of any
kind.

**The check must match the accessor family, not one name.** For four phases
`check-portal-exposure` derived its table list by grepping `pg_policies.qual`
for the literal `portal_clients()` — and `organizations` was invisible to it the
whole time, because its portal policy uses `app.portal_orgs()`. The row access
was correct; nothing was enumerating the thirteen columns that came with it.
The predicate now matches `app.portal_*`, and three of those columns
(`default_tax_rate`, `invoice_prefix`, `invoice_terms_days`) are inventoried
with a `REVIEW:` marker rather than a rubber stamp: they are the contractor's
own defaults, shown nowhere in the portal, and belong in a side table or behind
a `portal_org_v` projection.

**The standard is enforced, not just documented.** `npm run
check:portal-exposure` enumerates every column a portal contact can read —
deriving the table list from the catalogue, so adding a portal policy to a new
table brings it under the check automatically — and fails on anything not
signed off in `supabase/portal-exposure.json`, in both directions. Discipline
was the known weakness of the side-table pattern; this is the answer to it.
That check is also what found `job_status_events.reason` — free text a
dispatcher writes for colleagues, on a table a contact could read rows from,
one keystroke away from being a live leak.

**Writing a parent and its note is one transaction.****Writing a parent and its note is one transaction.** `create_job` and
`create_site` exist because a job and its internal note are now two
statements, and two statements from a browser are two PostgREST requests and
therefore two transactions. Both are `SECURITY INVOKER` and derive `org_id`
from the client rather than accepting it, so a job cannot disagree with its
client. `set_job_internal_notes` sets or clears one note; blank deletes the
row, because absence is how "no note" is stored.

**Advisor findings are gated in CI, not watched in a dashboard.**
`npm run check:advisors` reads the Security and Performance advisors and fails
on any finding not accepted, with a written reason, in
`supabase/advisor-allowlist.json`. Splinter — the linter behind the advisors —
runs SQL against the catalog rather than reading migrations, and has no
suppression mechanism of any kind (`cache_key` exists in its lint interface
for an exclusion list that was never given a user-facing implementation), so
this is where exceptions live and adding one is a reviewed diff. A stale entry
that no longer matches any finding also fails, so exceptions cannot rot into a
place where real findings hide. Performance `INFO` is counted but not gated:
it is dominated by `unindexed_foreign_keys` on columns nothing queries and
`unused_index`, which on a project that has served no production traffic flags
the indexes that were added on purpose.

There are currently **no ERROR-level findings**. The accepted set is the
`number_sequences` deny-all posture, the five definer RPCs that signed-in users
are meant to call, and eleven `multiple_permissive_policies` warnings that are
the price of serving staff and contacts from one `authenticated` role.

**Evidence commits are idempotent, and that is the load-bearing part.** The
field pipeline is compress → IndexedDB → resumable upload (tus) → insert the
row, and any step can be interrupted and resumed hours later on a different
network. The dangerous failure is not a commit that fails — it is a commit
that **succeeded and lost its response**, because the retry then duplicates
the photo. So the client mints `client_ref` before the first attempt, and
`unique (org_id, client_ref)` turns a replay into a conflict rather than a
second row. `isCommitAlreadyApplied` treats that conflict as success.
Confirmed against the live API: the first commit returns `201`, the identical
replay returns `409` with code `23505`.

The same `client_ref` is the storage filename, so a resumed upload targets the
same object instead of leaving a half-written orphan beside it.

**Evidence is internal until someone says otherwise.** `client_visible`
defaults to false, and the storage policy for the client consults it — so
toggling it off stops new signed URLs from being issued immediately. It does
**not** recall a URL already in a client's hands: a signed URL is a bearer
token and stays valid until it expires. Verified both halves. That is why
evidence URLs are signed for 60 seconds rather than an hour.

**The storage path is the tenant boundary, not a convention.**
`evidence/<org_id>/<job_id>/<client_ref>.<ext>`, with the policies keying off
`(storage.foldername(name))[1]`. A tech uploading under another org's prefix
is refused with `42501`. Deletion is owner/admin only — a tech refused with
`AccessDenied` — because a photo that can vanish is worth less as evidence.

**Two clocks, both recorded.** `captured_at` is the device's and can be wrong;
`created_at` is the server's. Keeping both means the field log can show the
order the tech actually worked in while the record still says when things
arrived. The gallery orders by the device clock and falls back to the server's,
and the index matches that expression.

**Notes are sent before photos.** `comparePriority` puts a few hundred bytes
saying "valve seized, need the 24mm" ahead of a 3MB photo of the valve,
because one bar of signal should deliver the message even if the photo does not
get through that window.

**Sign-off is structurally a client act.** `job_status_transitions` registers
`work_complete -> client_accepted` with `actor_kind = 'client'`, and the status
trigger checks the actor against that table — so a contractor cannot mark
their own work as accepted by the customer, in the same way they cannot
approve their own quote. Verified: a staff `UPDATE` to `client_accepted` is
refused with `illegal job transition work_complete -> client_accepted for
actor staff`.

**Declining completion moves nothing, on purpose.** Accepting travels the
client edge; rejecting records an `approvals` row with
`job_status_changed: false` and leaves the job where it is. There is no client
edge out of `work_complete` for a rejection, because a customer saying "this
isn't finished" is information for a dispatcher, not a unilateral reopening of
the job — someone has to decide whether to send a van or pick up the phone.

**Invoice arithmetic is copied from quotes, not re-derived.**
`invoice_line_items` uses byte-identical generated-column expressions to
`quote_line_items` — `round(quantity * unit_price_cents)` and
`round(round(quantity * unit_price_cents) * tax_rate)`. Not similar,
identical. An invoice that disagreed with the approved quote by one cent is a
dispute, and the cheapest way to guarantee agreement is the same SQL over the
same exact-decimal type. Verified on a live three-line mixed quote including a
negative discount: invoice and quote both 116000 / 9570 / 125570.

**The CSV export is where responsibility for money ends,** so it is pure and
heavily tested (30 tests). Three things it exists to get right: money never
touches a float (`minorUnitsToDecimal` splits the integer rather than dividing
by 100, and _throws_ on a non-integer rather than rounding it); a text field
that would be read as a formula is neutralised, because a client named
`=HYPERLINK(...)` is a live attack on the bookkeeper's machine delivered by
our own export; and **numeric fields are deliberately not neutralised**,
because a credit line legitimately begins with `-` and prefixing it would
corrupt every discount in the ledger. That distinction is why columns carry a
type. Currency minor units come from the currency, not a constant — JPY has
none and BHD has three.

`csv.fixtures.ts` holds a real invoice copied out of the database, so the
export is asserted against numbers Postgres generated rather than against my
arithmetic — the same technique as `totals.fixtures.ts`.

**The dashboard is one round trip.** `dashboard_summary(org_id)` returns eight
job counts, three quote figures and six invoice figures as one jsonb payload,
`SECURITY INVOKER`, so every number is filtered by the caller's own policies.
A tech therefore receives **zeroes** for everything priced — accurate, and
misleading if rendered, because "0 outstanding" reads as "nothing owed" rather
than "not your business". The money row is gated on role, not on the values.
That honest-looking zero is the trap this design creates, so it is named in
both the migration and the query module.

Tiles are ordered by who is waiting: things where a client waits on us, then
things where we wait on a client, then money. Every tile is a link to the
filtered list that produced its number — a dashboard figure you cannot act on
is one you stop reading.

**The status palette is darker than it looks like it should be.** Fourteen
status badges use their hue as text on a 10% tint of itself. At the lightness
a status palette naturally wants (0.6–0.72) that lands between **2.33:1 and
4.33:1** on a light card — every one of them failed WCAG AA, `in_progress`
worst. The light-theme tokens are now solved for 4.85:1 against the
composited tint, keeping hue and chroma. `closed` and `cancelled` go further
down than contrast requires, because near-neutral tokens have only lightness
to work with and at the passing ceiling `draft` and `closed` came out
identical. `.storybook/docs/sunlight.browser.test.ts` asserts all of it, so
brightening any of them fails.

**The sunlight bar is AAA, not AA.** A tech reads this outdoors, in sun,
through a scratched screen protector. WCAG AA is calibrated for an office, so
body text on background and on card is held to 7:1 (measured: 17.8:1 and
18.1:1 light, 17.5:1 and 16.3:1 dark), and every non-text boundary a user has
to _find_ — focus rings, the destructive tone — to the 3:1 that WCAG 1.4.11
requires. `FieldShell` now sets `data-density="comfortable"`, which was
defined in the stylesheet from Phase 1 and never actually opted into: the
48px targets it describes were dead CSS until this phase.

**Sign-up is invite-only, and there were two doors.** `enable_signup` stays
`true` — turning it off would block invited people too, since they create
their own account from the magic link. Instead the `before_user_created` auth
hook rejects an address with no pending `org_invitations` or `client_contacts`
row, so the database, which already knows who was invited, is what decides. It
fires for OAuth as well as email, so enabling Google later does not open a
side entrance, and it fires only on user _creation_, so it cannot lock out
anyone who already has an account.

The second door was `create_organization()`, which was granted to
`authenticated` with no further check. Closing only sign-up would have left an
invited _client contact_ — someone invited to view their own jobs — able to
sign in and spin up a contractor workspace. It now requires a platform
invitation (`org_invitations` with `org_id is null`), which is consumed on use.

On an empty project both gates open: the hook allows the first sign-up and
`create_organization` allows the first org, because there is nobody to issue
an invitation yet.

**One invitations table, two kinds.** `org_id is not null` means "join this
org as `role`"; `org_id is null` means "create your own org". Both expire,
both are consumed once, both are read by the same gate — splitting them would
duplicate the lifecycle and the policies for one nullable column. There is no
`DELETE` grant: an invitation is revoked, not erased, because "who invited
this person" is the question you ask after something goes wrong. Revoking also
closes the sign-up door it opened.

**`citext` comparisons need `operator(extensions.=)`.** Every function pins
`set search_path = ''`, which is right — but operators resolve by name through
the search_path, and `citext`'s `=` lives in `extensions`. With an empty
search_path it is invisible and PostgreSQL _silently_ falls back to the
implicit cast to text and `text = text`, which is case-sensitive. Same syntax,
opposite semantics, no warning:

    search_path = '' :  'A@B.com'::citext = 'a@b.com'::citext  ->  FALSE
    normal session   :  'A@B.com'::citext = 'a@b.com'::citext  ->  TRUE

The second line is what you get checking it by hand, which is why this
survived three phases inside `bootstrap_session`: a client contact invited as
`Sam@Firm.com` who signed up as `sam@firm.com` never had their invitation
claimed, with no error anywhere. `npm run check:sql` now fails the build on a
bare `=` between citext columns in an empty-search_path function.

**Money is integer cents everywhere** — database, UI, CSV export. Never a
float. One shared `computeTotals` serves quotes, invoices and the accounting
export so the three cannot disagree.

## Hosting

The SPA is served by **Firebase Hosting** from the `riglink-508420` Google
Cloud project, at `my.riglink.app`. It is static files only — there is no
server code of ours in the request path.

    npm run build
    npm run deploy:web             # firebase deploy --only hosting

CI deploys on every push to `main` once the gate passes, authenticating with
Workload Identity Federation — there is no service account key anywhere.

### Why not a Supabase Storage bucket

That was the original plan, and it does not work. Two properties of Storage,
both measured against the live project:

1. **Storage will not serve HTML as HTML.** An object uploaded with
   `content-type: text/html; charset=utf-8` — confirmed stored correctly in
   `storage.objects.metadata` — comes back as `text/plain`. The same bytes
   uploaded as `.html`, `.txt` and `.bin`, all with an explicit `text/html`,
   all served as `text/plain`: it is the content type that is refused, not the
   extension. That is deliberate on Supabase's part — serving arbitrary
   uploaded HTML from a shared `*.supabase.co` origin would be a cross-tenant
   XSS vector. A browser shows the app's source.
2. **There is no SPA fallback.** A missing object returns a JSON body, so
   `/acme/jobs/4f2a` — a deep link, or just pressing refresh — returns
   `{"error":"not_found"}`.

Storage keeps the jobs it is good at: `evidence`, `branding`, `exports`.

### Why Firebase and not Cloudflare

Cloudflare Workers Static Assets was set up first and works, but a Workers
custom domain requires the whole `riglink.app` zone on Cloudflare DNS, and
the domain lives in Cloud DNS alongside the rest of the Google Cloud setup.
Firebase attaches a subdomain with two records in the existing zone. At this
app's traffic, Cloudflare's free bandwidth is not worth a second cloud.

### firebase.json

`firebase.json` is the whole security posture of the site: routing, the CSP,
and the cache policy. JSON has no comments, so the reason for each value lives
in `infra/firebase/hosting.test.ts`, which asserts it. The CSP names the
Supabase origin, and `vite build` fails if it does not match the
`VITE_SUPABASE_URL` being built with, rather than ship a CSP that blocks the
app's own API.

Three Firebase behaviours shape it. None is in Firebase's docs; each was
measured against a deployed preview channel:

- **Header rules match the requested path, not the rewrite target.** A deep
  link is served `index.html` but never matches a `/index.html` rule, so the
  shell's `no-cache` lives on the catch-all `**` rule.
- **The later rule wins** when two set the same header. The `/assets/**`
  immutable rule must come after the catch-all; reversed, every asset ends up
  `no-cache` and the content-hashed filenames buy nothing.
- **`!/assets/**` works as a rewrite source.** Everything except assets falls
  back to the shell; a missing chunk gets a real 404 rather than `index.html`
  served as JavaScript.

**A deploy needs no cache purge:** Firebase invalidates its CDN on release,
asset filenames are content-hashed, and the shell is `no-cache`.

### Infrastructure as code

The durable resources — the custom domain, its Cloud DNS records, and the
identity CI deploys with — are OpenTofu, in `infra/tofu/`. The site content
deliberately is **not**: it is a build artifact that changes every commit.

    firebase   deploys the app on every commit   (build artifact)
    opentofu   points a hostname at it, once     (infrastructure)

The DNS zone itself is referenced, not managed: it also carries the domain's
mail records. `infra/tofu/README.md` has the first-run steps.

Supabase is deliberately not managed by OpenTofu. Its schema is migrations in
this repo with a sync check, and its settings are `config.toml` with a drift
check; adding Terraform would make a third source of truth for things two
mechanisms already own.

### Still to do before the first real deploy

1. `tofu apply` in `infra/tofu/` (see its README). It also writes the two
   GitHub Actions variables the deploy job reads.
2. Once `tofu output host_state` is `HOST_ACTIVE`, set `site_url` in
   `config.toml` to `https://my.riglink.app` and `npm run config:push`. Until
   then magic links redirect to `localhost:3000`, and the failure presents as
   "magic links are broken" rather than "the config still points at a laptop".
3. Delete the retired `app` bucket (see BOOTSTRAP.md) — it is already private
   and serving nothing, but the objects are still there.

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
