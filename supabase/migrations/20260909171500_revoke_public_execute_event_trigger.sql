-- ============================================================================
-- Close new functions automatically.
--
-- THE HOLE THE PREVIOUS MIGRATION COULD NOT CLOSE
--
-- `alter default privileges ... revoke execute on functions from public` is
-- accepted, and pg_default_acl afterwards genuinely shows no PUBLIC entry:
--
--   public / f -> {postgres=X/postgres,service_role=X/postgres}
--
-- and yet a function created immediately afterwards comes out as
--
--   {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--                  ^-- `=X` is PUBLIC
--
-- Verified on this project, twice, in both `public` and `app`. Postgres unions
-- the stored default ACL with the built-in world default for functions rather
-- than substituting it, so EXECUTE to PUBLIC cannot be withdrawn ahead of
-- time. Tables and sequences have no such world default, which is why the
-- same statement works perfectly for them.
--
-- PUBLIC includes `anon`. So every function added to `public` from now on is
-- born callable at /rest/v1/rpc/<name> by anyone holding the publishable key,
-- until someone remembers a `revoke`. The existing RPCs each carry that
-- revoke by hand and are closed today -- `has_function_privilege('anon', ...)`
-- is false for all of them -- but "we remembered every time" is not a control,
-- and a definer RPC is the one object where forgetting is worst: it runs as
-- its owner, so the caller's missing table grants do not save us.
--
-- WHAT THIS DOES
--
-- An event trigger revokes EXECUTE from PUBLIC and `anon` on every function
-- created or replaced in `public` or `app`. Explicit grants are untouched, so
-- `grant execute ... to authenticated` on the next line of a migration still
-- works and is still the only way a client reaches an RPC.
--
-- Why an event trigger and not a convention plus a lint: this holds for DDL
-- from any source -- a migration, a psql session, the dashboard SQL editor --
-- and it cannot be forgotten. Event triggers are already a load-bearing part
-- of this project's posture: `ensure_rls` (Supabase's own, and postgres-owned)
-- is what turns RLS on for new tables, and the previous migration's grant
-- revoke was confirmed not to disturb it.
--
-- Extension-owned functions are skipped. `create extension` installs
-- functions whose PUBLIC grant is part of how the extension is meant to work,
-- and rewriting those is not our business.
-- ============================================================================

create or replace function app.revoke_public_execute()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select cmd.objid
    from pg_event_trigger_ddl_commands() cmd
    where cmd.object_type = 'function'
      and cmd.in_extension = false
      and cmd.schema_name in ('public', 'app')
  loop
    -- format(%s) on a regprocedure is already fully qualified and quoted by
    -- Postgres, so there is no injection surface in the function name here.
    execute format('revoke execute on function %s from public, anon', r.objid::regprocedure);
  end loop;
end;
$$;

comment on function app.revoke_public_execute() is
  'Event trigger: strips the Postgres world default (EXECUTE to PUBLIC) from '
  'functions created in public/app, because ALTER DEFAULT PRIVILEGES cannot. '
  'Explicit grants are unaffected.';

drop event trigger if exists revoke_public_execute;
create event trigger revoke_public_execute
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
  execute function app.revoke_public_execute();
