# Database verification

`supabase test db` needs Docker, which is unavailable in the current
workspace, so these suites were executed against the remote project through
the Supabase MCP `execute_sql` tool, each wrapped in
`begin; … rollback;` so nothing persists. Every run left `auth.users`,
`organizations`, `clients`, `jobs` and `profiles` at zero rows.

Results at the time of writing: **48 assertions, all passing.**

| Suite                     | Assertions | Covers                                                                                                                                                       |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01_hook_claims.sql`      | 7          | Hook output for staff-only, portal-only, both and neither; required claims preserved; profile trigger fires                                                  |
| `02_tenant_isolation.sql` | 13         | Cross-tenant reads under the real `authenticated` role; drafts hidden from the portal; a user with no membership sees nothing                                |
| `03_guards.sql`           | 12         | Illegal status transitions; client-only transitions refused to staff; append-only audit trail; admin cannot self-promote to owner; tech confined to own jobs |
| `04_epochs_and_rpcs.sql`  | 23         | Epoch bumps, stale-token P0001, post-refresh behaviour, overflow fallback, `create_organization` validation, `my_memberships`                                |

## Two findings these tests produced

1. **`app.bump_claim_epoch` raised 21000 on every role change.** `old.user_id`
   and `new.user_id` are the same on a normal UPDATE, so `ON CONFLICT DO
UPDATE` tried to touch one row twice. Fixed by `select distinct`
   (`20260908200900_fix_bump_claim_epoch_dedupe.sql`).

2. **The hook read zero rows in production.** It runs as
   `supabase_auth_admin`, which does not bypass RLS, so `GRANT SELECT` alone
   was insufficient — but testing as `postgres` (which _does_ bypass) hid it
   completely. Fixed by explicit read policies for that role
   (`20260908201100_auth_admin_hook_read_policies.sql`).

## Not yet verified end to end

The hook must be enabled in the dashboard (`Authentication > Hooks`) before a
real sign-in mints real claims. Until then the claim-parsing path is proven
(claims injected via `set request.jwt.claims`) but the GoTrue → hook → JWT
wiring is not.

## Porting to pgTAP

`pgtap` 1.3.3 is available on the project. When Docker is available, convert
each suite to `plan()` / `ok()` / `throws_ok()` and run via `npm run db:test`;
the assertions translate directly, since each already compares an actual to an
expected value.
