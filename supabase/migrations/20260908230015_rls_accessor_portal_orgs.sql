-- Portal routes are /portal/$orgSlug/..., so a client contact must be able to
-- read that organization's name and branding. Their claims carry client ids,
-- not org ids, so this maps one to the other. Definer + stable, so it is a
-- single hoisted lookup per statement rather than a per-row join.
create or replace function app.portal_orgs()
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select coalesce(
    (select array_agg(distinct c.org_id)
     from public.clients c
     where c.id = any (app.portal_clients())),
    '{}'::uuid[]
  );
$$;

grant execute on function app.portal_orgs() to authenticated;
