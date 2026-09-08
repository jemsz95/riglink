-- BUGFIX: on a plain UPDATE (e.g. changing a role) old.user_id = new.user_id,
-- so the array below held the same id twice and ON CONFLICT DO UPDATE raised
-- 21000 "cannot affect row a second time". That broke every role change.
-- `select distinct` collapses the duplicate while still covering the genuine
-- two-user case: an UPDATE that reassigns a membership to a different user,
-- where BOTH the losing and the gaining user need their epoch bumped.
create or replace function app.bump_claim_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auth_claim_epochs as e (user_id, epoch, reason)
  select distinct u, 1, tg_table_name || ':' || tg_op
  from unnest(array[
    case when tg_op <> 'INSERT' then old.user_id end,
    case when tg_op <> 'DELETE' then new.user_id end
  ]) as u
  where u is not null
  on conflict (user_id) do update
    set epoch = e.epoch + 1,
        bumped_at = now(),
        reason = excluded.reason;

  return null;
end;
$$;
