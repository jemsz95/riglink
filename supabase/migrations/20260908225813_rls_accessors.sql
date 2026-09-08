-- ============================================================================
-- RLS accessors.
--
-- These are the ONLY interface policies use. Their signatures are stable, so
-- swapping the authorization source (claims today, edge-checked claims later)
-- is a change to this one file rather than a rewrite of every policy.
--
-- Each is:
--   stable            -- so the planner hoists it into a per-statement InitPlan
--                        rather than re-evaluating per row (the classic "RLS
--                        made my query 400x slower" bug)
--   security definer  -- so the overflow fallback can read membership tables
--   parallel restricted -- inherited from claims_fresh(), which reads a table
--   search_path = ''  -- every reference schema-qualified, so a hostile
--                        search_path cannot hijack a privileged function
--
-- Policies MUST call these as `= any ((select app.staff_orgs())::uuid[])`.
-- The trailing cast is load-bearing, and measured:
--   any ((select f())::uuid[])  -> InitPlan, called ONCE   (0.24ms / 5k rows)
--   any (f())                   -> called PER ROW          ( 299ms / 5k rows)
-- Without the cast the parser treats `(select f())` as a sublink and the
-- statement fails outright with `operator does not exist: uuid = uuid[]`.
-- ============================================================================

create or replace function app.staff_orgs()
returns uuid[]
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare
  v_claims jsonb;
begin
  -- Raises P0001 if the token predates a membership change.
  perform app.claims_fresh();
  v_claims := app.claims();

  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return coalesce(
      (select array_agg(m.org_id)
       from public.org_members m
       where m.user_id = (select auth.uid())
         and m.accepted_at is not null),
      '{}'::uuid[]
    );
  end if;

  return coalesce(
    (select array_agg(k::uuid)
     from jsonb_object_keys(coalesce(v_claims -> 'orgs', '{}'::jsonb)) k),
    '{}'::uuid[]
  );
end;
$$;

create or replace function app.orgs_with_role(p_roles text[])
returns uuid[]
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare
  v_claims jsonb;
begin
  perform app.claims_fresh();
  v_claims := app.claims();

  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return coalesce(
      (select array_agg(m.org_id)
       from public.org_members m
       where m.user_id = (select auth.uid())
         and m.accepted_at is not null
         and m.role::text = any (p_roles)),
      '{}'::uuid[]
    );
  end if;

  return coalesce(
    (select array_agg(e.key::uuid)
     from jsonb_each_text(coalesce(v_claims -> 'orgs', '{}'::jsonb)) e
     where e.value = any (p_roles)),
    '{}'::uuid[]
  );
end;
$$;

create or replace function app.portal_clients()
returns uuid[]
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare
  v_claims jsonb;
begin
  perform app.claims_fresh();
  v_claims := app.claims();

  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return coalesce(
      (select array_agg(distinct c.client_id)
       from public.client_contacts c
       where c.user_id = (select auth.uid())
         and c.revoked_at is null
         and c.accepted_at is not null),
      '{}'::uuid[]
    );
  end if;

  return coalesce(
    (select array_agg(v::uuid)
     from jsonb_array_elements_text(coalesce(v_claims -> 'clients', '[]'::jsonb)) v),
    '{}'::uuid[]
  );
end;
$$;

-- Convenience for UI-facing checks and RPC guards. Returns null when the
-- caller is not a member of the org.
create or replace function app.role_in_org(p_org uuid)
returns text
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare
  v_claims jsonb;
begin
  perform app.claims_fresh();
  v_claims := app.claims();

  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return (select m.role::text
            from public.org_members m
            where m.user_id = (select auth.uid())
              and m.org_id = p_org
              and m.accepted_at is not null);
  end if;

  return v_claims -> 'orgs' ->> p_org::text;
end;
$$;

-- ----------------------------------------------------------------------------
-- Debuggability is the real regression versus table lookups: you can no longer
-- `select app.staff_orgs()` in psql and get a useful answer, because there is
-- no JWT in that session. This surfaces what the current session actually sees.
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"...","app_metadata":{...}}';
--   select app.debug_claims();
-- ----------------------------------------------------------------------------
create or replace function app.debug_claims()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'uid', (select auth.uid()),
    'app_metadata', app.claims(),
    'staff_orgs', to_jsonb(app.staff_orgs()),
    'portal_clients', to_jsonb(app.portal_clients()),
    'overflow', coalesce((app.claims() ->> 'overflow')::boolean, false)
  );
$$;

grant execute on function app.claims() to authenticated;
grant execute on function app.claims_fresh() to authenticated;
grant execute on function app.staff_orgs() to authenticated;
grant execute on function app.orgs_with_role(text[]) to authenticated;
grant execute on function app.portal_clients() to authenticated;
grant execute on function app.role_in_org(uuid) to authenticated;
grant execute on function app.debug_claims() to authenticated;
