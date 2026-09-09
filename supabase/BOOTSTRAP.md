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
