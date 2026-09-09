# Provisioning a riglink instance

Everything required to reproduce this project's behaviour lives in this repo.
There are no dashboard-only steps.

| What                                               | Where                                        | Applied by                                                                                        |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Schema, RLS, functions, RPCs                       | `supabase/migrations/*.sql`                  | `supabase db push`                                                                                |
| Auth settings, **including the access-token hook** | `supabase/config.toml`                       | `supabase config push`                                                                            |
| Storage buckets                                    | `supabase/config.toml` `[storage.buckets.*]` | `supabase config push` (also created in a migration from phase 4, so prod and local cannot drift) |
| OAuth client secrets                               | `supabase/.env` (gitignored)                 | referenced by `config.toml` via `env(...)`                                                        |

## Fresh instance

```bash
supabase login
supabase link --project-ref <new-project-ref>

npm run deploy      # db push + config push, in that order, as one unit
npm run db:types    # regenerate src/lib/supabase/database.types.ts
```

`npm run deploy` exists so schema and auth config cannot diverge. Running
`db push` without `config push` leaves the hook function present but not
invoked, which is the one way to get a half-deployed instance.

## Why `config push` matters more than it looks

`[auth.hook.custom_access_token]` in `config.toml` is the authorization source
of record. Authorization rides in the JWT, so if the hook is not enabled:

- tokens arrive with no `app_metadata`
- every RLS policy denies
- the app renders as uniformly **empty, with no error anywhere**

That is indistinguishable from "this account has no data".

The fix for that is deployment discipline, not runtime defence: the hook is
declared in `config.toml`, `config.toml` is version controlled, and
`npm run deploy` pushes it alongside the migrations. A half-deployed instance
is a deployment bug, and the app deliberately does not try to detect or
work around one.

`config push` is **authoritative**: it overwrites the remote project's auth
settings with this file. That is the point, but it means a setting changed in
the dashboard and not mirrored here will be reverted on the next push. Use
`npm run config:diff` before pushing to see exactly what will change.

## A subtlety worth not rediscovering

The hook runs as `supabase_auth_admin`, which does **not** have `BYPASSRLS`
(only `postgres` does). `GRANT SELECT` on its input tables is therefore not
sufficient — RLS still applies, no policy matches that role, and the hook reads
zero rows while appearing to work perfectly when tested as `postgres`.

`20260908232252_auth_admin_hook_read_policies.sql` adds narrow SELECT-only
policies for that role on exactly the three tables it needs
(`org_members`, `client_contacts`, `auth_claim_epochs`) and nothing else.

## Verifying an instance

```bash
# 1. Auth config matches this repo (empty diff = in sync)
npm run config:diff

# 2. Migration history matches
supabase migration list

# 3. anon is refused on the definer RPCs, and reads leak nothing
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/create_organization" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' -d '{"p_name":"x","p_slug":"x"}'
# expect: {"code":"42501", ... "permission denied for function create_organization"}
```

**4. The hook actually mints claims** — the only check that exercises
GoTrue → hook → JWT end to end. Sign in, then decode the access token:

```js
JSON.parse(atob(session.access_token.split('.')[1])).app_metadata
// => { claims_version: 1, orgs: {...}, clients: [...], epoch: N, overflow: false }
```

`claims_version` present is the pass condition, and it is the check to run
after provisioning a new instance. `orgs: {}` on its own is fine — a user with
no memberships looks like that legitimately.

## Claim-shape changes

`app_metadata.claims_version` is checked by the client against
`EXPECTED_CLAIMS_VERSION` in `src/lib/auth/session-store.ts`. When the shape
changes, in the same migration:

1. bump the literal in the hook,
2. bump the constant in the client,
3. `update auth_claim_epochs set epoch = epoch + 1;`

Step 3 is what forces every live session to refresh into the new shape instead
of failing in ways nobody can reproduce.

## Verified against the live project

The whole chain has now been exercised on `nhrtxcdmnjvewvctfwao` with a real
GoTrue-issued token, not simulated in SQL:

| Step                                    | Result                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sign in, no memberships                 | `claims_version: 1`, `orgs: {}`, `clients: []`, `epoch: 0`, `overflow: false`                      |
| `exp - iat` on the token                | 600s, confirming the pushed `jwt_expiry`                                                           |
| `create_organization`                   | org created, caller's claim epoch bumped 0 → 1                                                     |
| Reuse of the pre-membership token       | `P0001` / `hint: refresh_session`, message `stale authorization claims (token epoch 0, current 1)` |
| After `refresh_token`                   | `epoch: 1`, `orgs: { "<id>": "owner" }`, and the previously refused read succeeds                  |
| Insert a job with no `number`           | trigger assigned 1, then 2 — gapless per org                                                       |
| Illegal transition (`draft → invoiced`) | `23514 illegal job transition draft -> invoiced for actor staff`                                   |
| Client-only edge attempted by staff     | `23514` — staff cannot forge a client approval                                                     |
| `DELETE` on `job_status_events`         | affects nothing; the audit trail is append-only                                                    |
| Realtime `postgres_changes`             | both `jobs` and `job_status_events` bindings deliver                                               |
| Realtime `old_record` payload           | contains only `id`, confirming `REPLICA IDENTITY DEFAULT` keeps `internal_notes` server-side       |

All test rows were removed afterwards; every table is back to zero except the
36 rows of `job_status_transitions` reference data seeded by migration.

### The approval loop (Phase 3)

Run with four real users — an owner, a `primary` contact, a `viewer` contact
and a `tech` — all signing in through the public auth endpoint:

| Step                                                                 | Result                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Contact claims a pending invite via `bootstrap_session`              | `contacts_claimed: 1`, and the refreshed token carries `clients: [<id>]` with `orgs: {}`                             |
| `submit_job_request`                                                 | job created `requested`, `source: client_portal`, contact attributed, and the history row reads `actor_kind: client` |
| One batch insert of 3 mixed lines                                    | generated columns exact, including `-2550` / `-510` on the discount line                                             |
| Header totals                                                        | 25363 + 5073 = 30436, matching `computeTotals` in TypeScript exactly                                                 |
| Client reads a DRAFT quote                                           | empty — through the views _and_ the base tables                                                                      |
| Client approves a draft                                              | refused, `23514`                                                                                                     |
| `send_quote`                                                         | status `sent`, `locked_at` set, job → `quoted`                                                                       |
| Line edit after send, as the OWNER                                   | refused, `23514`, hint `supersede the quote…`                                                                        |
| Staff attempt `quoted → approved`                                    | refused: `illegal job transition quoted -> approved for actor staff`                                                 |
| `approve_quote` as the primary contact                               | approval row written, quote and job → `approved`, history row `actor_kind: client`                                   |
| `approvals.snapshot`                                                 | full header, job, and every line with its computed totals; lines sum to the header total                             |
| Second approval on the same quote                                    | refused, `23514`                                                                                                     |
| `approve_quote` / `decline_quote` as a `viewer`                      | refused, `42501 not authorised to decide on this quote`                                                              |
| `UPDATE` / `DELETE` on `approvals`, as the owner                     | affect nothing — append-only                                                                                         |
| Expired quote (`valid_until` in the past)                            | refused, `23514`, hint `ask for an updated quote`                                                                    |
| A `tech` reads quotes / lines / catalogue / approvals                | all empty; the same tech sees the job itself                                                                         |
| An owner of a _different_ org                                        | sees no quotes or approvals; `send_quote` returns `42501 quote not found`                                            |
| `portal_*_v` columns `access_notes`, `internal_note`, `lead_tech_id` | `42703 does not exist` — structurally absent, not merely filtered                                                    |

Two bugs were found by this run and fixed in
`20260909164707` and `20260909164812`: both `send_quote` and
`app.decide_quote` moved the job unconditionally, so any **second** quote on a
job that had already been approved aborted the whole transaction against the
transition trigger. The client pressed Approve and nothing happened. Both now
consult `job_status_transitions` first and move the job only when the edge is
legal, which keeps "you cannot quote a cancelled job" while allowing
additional work on a live job.

All test rows were removed afterwards; every table is back to zero except the
36 rows of `job_status_transitions` reference data.

### Explicit grants and transactional quote writes

Verified live against the project after `20260909170200`–`20260909174500`.

| Check                                                                  | Result                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon` object privileges anywhere in `public` / `app`                  | none: every table, view, sequence and function returns false                                                                                                |
| `anon` USAGE on schema `app`                                           | denied — even naming `app.*` fails before privilege checks                                                                                                  |
| `authenticated` grants per table                                       | one verb at a time, matching the policies; `number_sequences` and `auth_claim_epochs` hold zero                                                             |
| New table created as `postgres`                                        | no `anon` / `authenticated` grants, and `relrowsecurity = true` from Supabase's `ensure_rls`                                                                |
| New `SECURITY DEFINER` function in `public`                            | `anon` and `authenticated` both false, stripped by the event trigger                                                                                        |
| `public.rls_auto_enable()`                                             | closed to `anon`, `PUBLIC` and `authenticated`; `ensure_rls` still fires (new table gets RLS)                                                               |
| `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` | accepted, `pg_default_acl` shows no PUBLIC — and the next function still gets `=X`. Hence the event trigger.                                                |
| EXECUTE privilege on a trigger function                                | not consulted when the trigger fires: a `BEFORE INSERT` trigger with EXECUTE revoked from PUBLIC still fired for `authenticated` and still modified the row |
| Full request → quote → approve loop under the new grants               | unchanged: sequence numbers, audit rows, generated columns, header totals, definer RPCs all work                                                            |
| `create_organization` with no INSERT grant on `organizations`          | succeeds — the definer path                                                                                                                                 |
| Job insert with zero privileges on `number_sequences`                  | `number` assigned; `job_status_events` row written with SELECT-only grant                                                                                   |
| `save_quote_draft`: 2 new lines, quantities as strings                 | totals 27450 / 2265 / 29715, identical to a hand-built insert and to `computeTotals`                                                                        |
| `save_quote_draft`: swap two positions + edit + add, in one call       | reorder applied, no unique violation (`unique (quote_id, position)` is deferred)                                                                            |
| `save_quote_draft`: drop to one line                                   | the other two deleted, header totals follow, omitted header keys preserved                                                                                  |
| `save_quote_draft` on a sent quote                                     | refused, `23514`                                                                                                                                            |
| `supersede_quote`                                                      | old quote `superseded` and still locked with its lines; new draft carries lines, notes and totals                                                           |

One bug was found by this run and fixed in `20260909174500`. The first
`save_quote_draft` guarded the upsert with `on conflict (id) do update ...
where t.quote_id = p_quote_id`, which protected the other quote but **skipped
the row silently** — ON CONFLICT with a failing WHERE is not an error. The
target quote's own lines had already been deleted for not appearing in the
incoming set, so the call returned success having left the quote empty. That is
reachable without malice: `supersede_quote` copies lines to new ids, so an
editor tab left open across a supersede holds ids that now belong to the
superseded quote. It now raises before deleting anything.

All test rows were removed afterwards; every table is back to zero except the
36 rows of `job_status_transitions` reference data.

### The portal column leak, and closing it

Found while verifying the staff views, and **pre-existing** — the staff views
did not cause it. Verified with a contact JWT holding one client id, before the
fix:

| Read as a portal contact                                          | Before                                      |
| ----------------------------------------------------------------- | ------------------------------------------- |
| `/rest/v1/jobs?select=*` → `internal_notes`                       | `SECRET: client is 90 days late on payment` |
| `clients.notes`                                                   | `SECRET: do not extend credit`              |
| `sites.access_notes`, `quotes.internal_note`, `jobs.lead_tech_id` | all readable                                |

Closed by `20260909184500`. After it, with the same JWT:

| Check                                                                                      | Result                                                                          |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `jobs`, `sites`, `quotes`, `quote_line_items`, `clients`, `job_status_events` as a contact | 0 rows each                                                                     |
| `internal_notes` / `notes` / `access_notes` / `internal_note` / `lead_tech_id`             | all null                                                                        |
| `staff_*_v` as a contact                                                                   | 0 rows (invoker views over policies they no longer have)                        |
| `portal_job_v`                                                                             | the one `requested` job; the `draft` job hidden                                 |
| `portal_quote_v`                                                                           | the `sent` quote only; the draft quote hidden                                   |
| `portal_quote_line_v`                                                                      | the sent quote's line only; the draft's line hidden                             |
| `my_memberships()` as a contact                                                            | client and org names still resolve (now definer)                                |
| A contact of a **different** client, same org                                              | 0 rows through all four portal views                                            |
| Stale claim epoch, reading a portal view                                                   | `P0001 stale authorization claims` — the gate fires inside an owner-rights view |
| `anon` on `portal_job_v` and on `jobs`                                                     | no privilege on either                                                          |
| `approve_quote` as the contact                                                             | works; approval readable; snapshot carries no `internal_note`                   |
| Staff owner after the change                                                               | unaffected: base tables, both staff views, `internal_notes` all still visible   |

### Staff views

| Check                                                           | Result                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `security_invoker` on all four `staff_*_v`                      | `on`                                                                 |
| Job with no site (LEFT JOIN)                                    | row present, `site_name` and `site_timezone` null                    |
| Search `%boiler, room%` — the comma that broke PGRST100         | matches; one ILIKE has no logic tree to break                        |
| Search `%3%`                                                    | matches title "room 3" and job number 3                              |
| Search on description, client `external_ref`, site contact name | all match through `search_text`                                      |
| `staff_client_list_v` counts                                    | `Acme:1 site/2 jobs`, `Borden:1/1` — computed under the caller's RLS |
| A `tech`                                                        | sees all 3 jobs, 2 clients, 2 sites — same as before                 |
| A user with no membership                                       | 0 rows through all four                                              |

### Staff-only notes in side tables

`20260909193000` / `20260909193500` / `20260909200000` replace the
owner-rights portal views with structural absence, which also cleared four
ERROR-level `0010_security_definer_view` findings that had no suppression
path. Verified live:

| Check                                                                                                           | Result                                                         |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `select internal_notes from jobs`, `notes from clients`, `access_notes from sites`, `internal_note from quotes` | all `42703` — the columns do not exist                         |
| Portal contact reading `jobs`/`sites`/`clients`/`quotes`/`quote_line_items`                                     | 1 row each — RLS row access is back (lock 1)                   |
| Portal contact reading all four note tables                                                                     | 0 rows each (lock 2)                                           |
| `portal_job_v` / `portal_quote_v` / `portal_site_v` as a contact                                                | still work; draft job and draft quote still hidden             |
| `create_site` with access notes                                                                                 | site + note in one transaction                                 |
| `create_job` with an internal note                                                                              | job + note in one transaction, `number` from the sequence      |
| `save_quote_draft` with `internal_note` in the header                                                           | routed to `quote_internal_notes`; readable via `staff_quote_v` |
| `set_job_internal_notes(job, 'text')`                                                                           | note set, visible through `staff_job_detail_v`                 |
| `set_job_internal_notes(job, '   ')`                                                                            | row deleted, view returns null — blank means absent            |
| `supersede_quote`                                                                                               | internal note carried to the new revision                      |
| A `tech`: job internal notes, site access notes, client notes                                                   | all visible — identical to when they were columns              |
| A `tech`: `staff_quote_v` and `quote_internal_notes`                                                            | 0 rows — techs still read nothing priced                       |
| Parent deletes with no explicit delete on the note tables                                                       | all four cascaded to 0 via the composite FKs                   |
| Security advisor                                                                                                | 0 ERROR; 1 INFO + 5 WARN, all intentional and allowlisted      |

### CI checks

`npm run check:advisors` and `scripts/check-migrations-in-sync.mjs`, both
exercised in each direction:

| Scenario                                    | Result                                                    |
| ------------------------------------------- | --------------------------------------------------------- |
| Advisors, allowlist complete                | `advisors: clean`, exit 0                                 |
| A finding missing from the allowlist        | names it with its `cache_key` and remediation URL, exit 1 |
| An allowlist entry matching nothing (stale) | names it, exit 1                                          |
| `SUPABASE_ACCESS_TOKEN` unset               | exit 2 and says to set the secret — never a silent skip   |
| Migrations in sync                          | `29 tracked`, exit 0                                      |
| A migration in the repo but not applied     | names it, says `npm run db:push`, exit 1                  |

### Field evidence (Phase 4)

Verified against the live project, over the real HTTP API rather than only in
SQL — the storage half cannot be tested any other way. Test accounts were
given passwords, signed in through `/auth/v1/token`, and removed afterwards.

| Check                                                 | Result                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Buckets after `db push`                               | `branding` (public), `evidence` (private), `exports` (private) — `config push` does **not** create remote buckets |
| Hook-minted claims in a real JWT (tech)               | `orgs: {<org>: "tech"}`, `epoch: 1`, `claims_version: 1`                                                          |
| tus create + PATCH as a tech                          | `Location` returned, PATCH `204`                                                                                  |
| Commit via PostgREST                                  | `201`                                                                                                             |
| **Identical replay of the same commit**               | `409`, code `23505` — the idempotency contract, matching `isCommitAlreadyApplied`                                 |
| Staff signs + fetches the object                      | sign `200`, fetch `200`, 344 bytes — the bytes uploaded                                                           |
| Contact signs while `client_visible = false`          | `400 / NoSuchKey` — RLS hides the object, so signing is refused                                                   |
| `bootstrap_session` + refresh as the contact          | `contacts_claimed: 1`; refreshed JWT carries `clients: [<id>]`, `epoch: 1`                                        |
| Contact signs + fetches after `client_visible = true` | sign `200`, fetch `200`, 344 bytes                                                                                |
| Contact after un-toggling                             | portal view `[]`, new sign `400 / NoSuchKey`                                                                      |
| **A signed URL issued before un-toggling**            | still `200` — the bearer-token caveat is real, hence the 60s TTL                                                  |
| Contact on the `job_evidence` base table              | only the visible photos; the internal note never appears                                                          |
| `portal_job_evidence_v.captured_by`                   | `42703` — structurally absent                                                                                     |
| Tech forging `captured_by` to a colleague             | refused `42501`                                                                                                   |
| Note carrying a file / photo with no file             | both refused `23514` by the shape constraint                                                                      |
| Evidence with a `client_id` that is not the job's     | refused `23503` by the composite FK                                                                               |
| Tech deleting evidence rows                           | 0 rows affected                                                                                                   |
| Tech deleting a storage object                        | `403 / AccessDenied`                                                                                              |
| Owner deleting a storage object                       | `200`                                                                                                             |
| Upload under another org's path prefix                | refused `42501` — the path is the tenant boundary                                                                 |
| Direct `delete from storage.objects` in SQL           | refused by Supabase's own `storage.protect_delete()` trigger, which prevents orphaned objects — use the API       |

Two notes on method, so the table is not read as more than it is. Several
earlier SQL-level probes printed their results by raising an exception, which
rolls the transaction back — including any `update` in the same call. The
readings were correct at the time they were taken, but the changes did not
persist, so anything that had to persist was re-checked over HTTP. And the
Playwright/browser spec (`src/lib/offline/queue.browser.test.ts`) is written
and wired into CI but **has never been run here**: this container is Talos with
no package manager, so Chromium's `libglib-2.0.so.0` cannot be installed.

### Portal exposure audit

`npm run check:portal-exposure` enumerates every column a client portal
contact can read from a base table. Run against the live catalogue:

| Result                                    |                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tables a contact has RLS row access to    | 7 — `approvals`, `clients`, `job_evidence`, `jobs`, `quote_line_items`, `quotes`, `sites` |
| Columns readable                          | 110, each signed off in `supabase/portal-exposure.json`                                   |
| A column present but not in the inventory | fails, names it, exit 1                                                                   |
| A whole new portal-readable table         | fails, names it as `(whole table)`, exit 1                                                |
| An inventory entry that no longer exists  | fails, names it, exit 1                                                                   |

The audit found one issue on its first run: **`job_status_events.reason`** —
free text a dispatcher writes for colleagues, on a table a contact could read
rows from. Nothing writes it yet and the portal reads that table not at all, so
it was latent rather than live. Closed in `20260909210000` by dropping
`job_status_events_portal_select`: the cheapest correct fix for a surface
nothing consumes is not to expose it. Reinstating a portal timeline later means
moving `reason` to a staff-only side table first, per the standard.

Removing that policy also made an advisor allowlist entry stale
(`multiple_permissive_policies` on `job_status_events`), which
`check:advisors` failed on until it was removed — the two checks keeping each
other honest.

### Completion, sign-off and invoicing (Phase 5)

Verified live, walking one job the whole way through.

| Step                                       | Result                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audit trail, end to end                    | `draft→requested/staff  requested→triaged/staff  triaged→quoted/staff  quoted→approved/client  approved→scheduled/staff  scheduled→in_progress/staff  in_progress→work_complete/staff  work_complete→client_accepted/client  client_accepted→invoiced/staff` |
| Staff `UPDATE` to `client_accepted`        | refused: `illegal job transition work_complete -> client_accepted for actor staff`                                                                                                                                                                           |
| `accept_completion` as the primary contact | approval row written, job → `client_accepted`, `job_status_changed: true`                                                                                                                                                                                    |
| Completion snapshot                        | carries the job, the approved quote total (125570) and the 1 client-visible photo                                                                                                                                                                            |
| Second sign-off on the same job            | refused `23514`                                                                                                                                                                                                                                              |
| `create_invoice_from_job`                  | invoice #1 raised, 3 lines copied, `due_at` = +30 days from `invoice_terms_days`                                                                                                                                                                             |
| **Invoice totals vs the approved quote**   | 116000 / 9570 / 125570 on both — exact match                                                                                                                                                                                                                 |
| Calling `create_invoice_from_job` again    | returns the SAME draft; still 1 invoice                                                                                                                                                                                                                      |
| `send_invoice`                             | status `sent`, `issued_at` set, job → `invoiced`                                                                                                                                                                                                             |
| Line edit after issuing                    | refused `23514`                                                                                                                                                                                                                                              |
| Sending twice                              | refused                                                                                                                                                                                                                                                      |
| `DELETE` an issued invoice                 | 0 rows affected — issued invoices are voided, never removed                                                                                                                                                                                                  |
| Contact reads `portal_invoice_v`           | the one `sent` invoice, 3 lines, total 125570                                                                                                                                                                                                                |
| A `tech` reads invoices / lines / quotes   | 0 / 0 / 0, while still seeing the job                                                                                                                                                                                                                        |

Two bugs were found by this run, both of which had applied cleanly and would
have failed on first real use:

1. **`app.decide_completion` read `v_contact.contact_id`.**
   `app.portal_contact_for()` returns a `client_contacts` ROW, so the field is
   `.id`. Declaring the variable as `record` instead of
   `public.client_contacts` meant plpgsql resolved the name at execution and
   the function would have failed at the moment a customer pressed Accept.
   Fixed in `20260909222000`.

2. **`app.decide_completion` never set `app.actor_kind`.** The status trigger
   reads `current_setting('app.actor_kind', true)` and DEFAULTS TO `'staff'`,
   so the sign-off was refused as a staff act — I wrote the transition check
   and omitted the `set_config` that makes the transition legal. Fixed in
   `20260909223000`. Worth noting the failure direction: the trigger blocked
   the write rather than recording a staff-attributed sign-off, so the audit
   trail could not be corrupted by this, only stopped.

3. **`app.assign_invoice_number` passed an explicit `NULL` period.**
   `number_sequences.period` is NOT NULL defaulting to `''`, and
   `app.next_number` has a default for that argument — passing `null`
   overrode it. Invoice numbers are non-periodic on purpose (`INV-1, INV-2`
   continues across years; restarting each January makes two invoices share a
   number). Fixed in `20260909224000`.

### Leaked password protection: Pro-gated, and data-dependent

`auth_leaked_password_protection` is in the allowlist's **`conditional`**
section, not `accepted`, and both halves of that are load-bearing.

It cannot be fixed on this plan:

```
PATCH /v1/projects/<ref>/config/auth  {"password_hibp_enabled": true}
-> HTTP 402
   "Configuring leaked password protection via HaveIBeenPwned.org is
    available on Pro Plans and up."
```

It is also not expressible in `config.toml` with this CLI version — four
candidate key spellings were probed and none produced a diff, and the CLI
silently ignores unknown keys, so the absence of an error there means nothing.

And it appears only once the project **has users**. I first assumed it tracked
users _with passwords_, because it vanished when I deleted the accounts I had
given passwords to for HTTP testing; it came back with the next fixture users,
who have none. So it is dormant in an empty database and present in any real
deployment. That is why `check:advisors` grew a `conditional` section: an entry
there may match nothing without failing the build, because deleting it while
dormant would hand the next person who creates a user an unexplained CI
failure. A stale entry in `accepted` still fails, which is verified in both
directions.

On upgrading to Pro: run that PATCH and delete the conditional entry.

### The sunlight review found a real defect

Phase 6's contrast pass is not decoration — it failed. All **fourteen** job
status badges missed WCAG AA in the light theme:

| Badge              | Before                            | After     |
| ------------------ | --------------------------------- | --------- |
| `in_progress`      | 2.33:1                            | 4.85:1    |
| `on_hold`          | 2.90:1                            | 4.85:1    |
| `work_complete`    | 2.86:1                            | 4.85:1    |
| every other status | 3.14:1 – 4.33:1                   | 4.85:1    |
| dark theme         | 4.59:1 – 7.71:1 (already passing) | unchanged |

The cause: the tokens are used as text on a 10% tint of themselves, and a
status palette's natural lightness is too light for that on a near-white card.
Fixed by solving each token's lightness for 4.85:1 against the composited
tint, keeping hue and chroma so the palette still reads as itself.

Fixing it introduced a second defect, caught by checking: `draft` and `closed`
became **identical** — near-neutral tokens have only lightness to work with,
and both hit the same passing ceiling. `closed` and `cancelled` are now pushed
darker than contrast requires so the terminal states stay distinguishable.
Closest remaining pair is 10.7 in sRGB distance, and colour was never the only
signal anyway: every badge carries an icon and a label.

Measured offline by converting the oklch tokens to sRGB and computing the
ratios, because the browser test that asserts them **cannot run in this
container** — Talos has no package manager, so Chromium's `libglib-2.0.so.0`
is unavailable. The assertions are written against the measured values with a
margin, so they should pass in CI, but treat them as unrun until the `browser`
job goes green.

Also fixed in this pass: no skip link existed anywhere (WCAG 2.4.1 — a
keyboard user tabbed the whole sidebar on every page), and `FieldShell` never
set `data-density="comfortable"`, so the 48px glove-friendly targets defined
in Phase 1 were dead CSS.

### Hosting: why not a Storage bucket

The plan was to serve the SPA from a public Storage bucket. It was built,
deployed and then abandoned, because Storage cannot host HTML. Measured
against the live project:

| Check                                                                 | Result                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Object metadata after upload                                          | correct: `mimetype: text/html; charset=utf-8`, `cacheControl: public, max-age=31536000, immutable` |
| `index.html` served from the public endpoint                          | **`content-type: text/plain`**                                                                     |
| Same bytes as `.html`, `.txt`, `.bin`, each with explicit `text/html` | all `text/plain` — the content type is refused, not the extension                                  |
| Hashed asset served                                                   | correct content type, but **`cache-control: no-cache`** despite the stored `immutable`             |
| Cache-busted request (CDN `MISS`)                                     | identical on both counts — origin behaviour, not a stale edge copy                                 |
| Missing object                                                        | JSON `{"error":"not_found"}` — no SPA fallback                                                     |

So the bucket cannot be a web root: a browser shows the app's source, and every
deep link 404s. A Cloudflare Worker in front fixed both and was verified
working against the live bucket — then deleted, because proxying a bucket
through Cloudflare is worse than serving the files from a static host directly.
Hosting is now Firebase Hosting. See README.

This also means an earlier suggestion of mine — hash routing, served straight
from the bucket — was never viable: it addresses the fallback problem and does
nothing about the content type.

### Retiring the `app` bucket: what could not be automated

`20260910010000` sets `public = false`, so nothing is served from it. The
bucket and its 132 objects are still there, and **could not be removed from
here**:

| Attempt                                                   | Result                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `delete from storage.buckets` in a migration              | refused by Supabase's `storage.protect_delete()` trigger, which exists to prevent orphaned objects |
| `DELETE /v1/projects/<ref>/storage/buckets/app`           | HTTP 404 — the Management API is GET-only for buckets                                              |
| `POST /v1/projects/<ref>/storage/buckets/app/empty`       | HTTP 404 — no such endpoint                                                                        |
| `supabase storage rm -r ss:///app/assets`                 | `{"deleted":[]}` and **exit 0** — no error, nothing deleted                                        |
| `supabase storage rm ss:///app/ct-probe.bin` (exact path) | same: `{"deleted":[]}`, exit 0                                                                     |

The CLI's `rm` evidently needs the service-role key and reports nothing when it
has not got it, which is worth knowing before trusting it in a script.

To finish the job, either delete the bucket in the dashboard (Storage →
`app` → Delete), or with the service-role key:

```
curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/app/empty" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/app" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

Nothing references it — no policy, no application code — so it is inert cruft
rather than a live surface.

### Invite-only sign-up

Verified against the live API, not just in SQL.

| Attempt                                                             | Result                                     |
| ------------------------------------------------------------------- | ------------------------------------------ |
| `POST /auth/v1/otp` for an uninvited address                        | `403` "This email has not been invited…"   |
| Invited staff address, **mixed case** (`Invited-Staff@Example.ORG`) | `200` — user created                       |
| Invitation past `expires_at`                                        | `403`                                      |
| Invited client contact                                              | allowed                                    |
| Address with no email in the payload                                | `403`                                      |
| Existing user signing in                                            | unaffected — the hook fires on CREATE only |

Two bugs were found by testing this against the real endpoint rather than by
calling the function as the owner, which succeeds and proves nothing:

1. **`citext` comparisons were case-sensitive.** See the README. It affected
   `bootstrap_session` too, which had shipped three phases earlier. Fixed in
   `20260912212000` with `operator(extensions.=)`, and guarded by
   `npm run check:sql` — which itself had to be fixed twice before it caught
   a deliberately reintroduced bug: `proconfig::text like '%search_path=""%'`
   never matches because the text rendering escapes the quotes, so it was
   examining zero functions; and the regex excluded a `.` before the column
   name, which is the common `c.email = …` shape.

2. **The hook could not reach `extensions`.** `supabase_auth_admin` had no
   `USAGE` on that schema, so every sign-up — invited or not — failed with
   `500 "Error running hook URI"`. GoTrue fails closed, so this broke sign-up
   entirely for a few minutes. Fixed in `20260912213000`.

### Operating it

Invite a colleague from **Settings → Invite a colleague**. The two things the
UI deliberately does not do, because they are operator actions:

```sql
-- Onboard a NEW contractor: lets this address create its own organisation.
insert into public.org_invitations (org_id, email, role)
values (null, 'owner@newfirm.com', null);

-- Escape hatch: re-admit an address when nobody is left to invite them.
insert into public.org_invitations (org_id, email, role)
values ('<org-id>', 'admin@firm.com', 'admin');
```

The `org_invitations_admin_insert` policy requires `org_id is not null`, which
is what stops an org admin minting a platform invitation from the app. A
platform operator now mints them from `/platform/invitations` instead of by
hand — `platform_invite_founder()` is `SECURITY DEFINER` and bypasses that
policy without it being widened. The SQL above remains the recovery path when
there is no operator to hand.

### Seeding auth users directly (for `seed.sql`)

Inserting into `auth.users` by hand fails sign-in with a bare
`500 Database error querying schema` unless the token columns are empty
strings rather than `NULL`. GoTrue scans them into non-nullable Go strings, so
`NULL` breaks the row scan before any password check happens:

```sql
confirmation_token, recovery_token, email_change_token_new,
email_change_token_current, email_change, phone_change,
phone_change_token, reauthentication_token  -- all '' , never NULL
```

Prefer the Auth admin API for real seeding. If SQL is unavoidable, set those to
`''` and `email_confirmed_at` to `now()`.

## Platform administration

### Granting the role

Deliberately not an RPC. An RPC that lets one operator mint another makes
compromise of a single session self-replicating and permanent — an attacker
grants themselves, revokes you, and you are locked out of your own platform.
The recovery path stays the `service_role` key, which never reaches a browser:

```sql
insert into public.platform_admins (user_id, granted_by, note)
values ('<user-id>', '<your-user-id>', 'second operator, agreed <date>');
```

Revoking is a `delete`, and a deferred constraint trigger refuses to leave the
table empty. Swapping operators in one transaction (delete + insert) works;
deleting the last one does not.

The first user on an empty deployment is granted it automatically by
`app.handle_new_user()`, guarded on **two** conditions — `platform_admins` is
empty _and_ `auth.users` holds nobody else. The second is not belt-and-braces:
with only the first, revoking the last operator re-arms the trigger, and the
next person to sign up — including an invited _client contact_ — would silently
inherit the platform.

### Verified against the live project

| Check                                                                                        | Result                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Platform admin reads Beta's `jobs` / `clients` / `sites` / `org_members` / `client_contacts` | 0 rows each, while their own org returns 2 jobs                                                                                |
| Platform admin reads Beta's owner `profiles` row                                             | 0 rows                                                                                                                         |
| `select * from pg_policies where qual ~ 'is_platform_admin'`                                 | empty — the invariant, checkable                                                                                               |
| `public.org_suspensions` as `authenticated`                                                  | `42501 permission denied` — structurally denied, not merely filtered                                                           |
| Every `platform_*` RPC as a non-operator                                                     | `42501 not a platform administrator`                                                                                           |
| Suspended org, as its own owner: jobs / clients / sites / members / colleague profile        | 0 rows each                                                                                                                    |
| Suspended org, as its own owner: the `organizations` row                                     | **still visible** — the app can say "suspended" rather than "not found"                                                        |
| Suspended org, as a portal contact: jobs / clients                                           | 0 rows; `my_memberships()` reports `org_suspended: true`                                                                       |
| Suspended org, `accept_completion()` as its own primary contact                              | `42501` — `app.portal_contact_for()` is the guard for all five portal write RPCs                                               |
| Suspended org under `overflow: true`                                                         | `member_orgs_all()` returns 1, `staff_orgs()` returns 0, jobs 0 — the live-read branch a claims-based design would have missed |
| Unsuspend, same session, no token refresh                                                    | access returns immediately                                                                                                     |
| Owner demoting themselves / deleting their own membership                                    | `23514 would be left with no owner`, hint names `transfer_ownership`                                                           |
| Promoting a second owner                                                                     | `23505 org_members_one_owner_per_org`                                                                                          |
| `transfer_ownership` as a tech                                                               | `42501 only the owner may transfer ownership`                                                                                  |
| `transfer_ownership` as the owner                                                            | roles swap, both claim epochs bump to 2                                                                                        |
| `accept_completion()` holding only a job uuid, with no contact row                           | `42501 not authorised to sign off this job` — succeeded before the fix                                                         |
| `accept_completion()` as the real primary contact                                            | approved, actor recorded, job → `client_accepted`                                                                              |

### Guards proven to fail

A check that has never failed has not been tested. Both were re-broken
deliberately and caught:

| Probe                                                     | Result                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| A function with a bare `email =` under `search_path = ''` | `check:sql` flagged `app.zz_probe_citext compares email`    |
| `organizations.slug` removed from the inventory           | `check:portal-exposure` flagged `public.organizations.slug` |

`check:portal-exposure` reports **10 tables, 160 columns** after the accessor
family fix — it was 9 and 147, with `organizations` unexamined.
