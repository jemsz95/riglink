-- The `app` schema holds everything that must NOT be reachable from PostgREST.
-- api.schemas is ["public", "graphql_public"], so nothing here is exposed as an
-- endpoint even though `authenticated` may execute individual functions.
create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon;
revoke all on schema app from authenticated;
grant usage on schema app to authenticated, service_role;

-- Shared updated_at trigger. One implementation, attached per table, rather
-- than repeating the assignment in every write path.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at is
  'BEFORE UPDATE trigger: maintains updated_at. Attach to every mutable table.';
