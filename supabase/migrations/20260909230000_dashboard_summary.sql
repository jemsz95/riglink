-- ============================================================================
-- Phase 6: the dashboard summary, as one round trip.
--
-- The alternative was six count queries from the browser. On a phone on site
-- that is six round trips before the page says anything, and every one of them
-- re-evaluates the same RLS predicates over the same tables.
--
-- SECURITY INVOKER, so it is not a privilege escalation dressed as a
-- convenience: every count below is filtered by the caller's own policies. A
-- tech calling this gets zeroes for anything priced, because `quotes` and
-- `invoices` have no policy that mentions app.staff_orgs(). That is correct,
-- but it means a UI showing a tech "0 outstanding" would be lying by
-- omission -- so the client hides the money tiles by role rather than
-- rendering the zeroes. Worth stating because the honest-looking zero is the
-- trap here.
--
-- `p_org_id` is required rather than inferred: a user can staff two orgs, and
-- a summary that quietly merged them would be worse than useless. It is also
-- redundant against RLS, which is the same argument as every other org filter
-- in this project -- it selects the index and it keeps two tenants' numbers
-- from being added together.
-- ============================================================================

create or replace function public.dashboard_summary(p_org_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'jobs', (
      select jsonb_build_object(
        -- The four states where somebody is waiting for somebody.
        'awaiting_client_quote_decision', count(*) filter (where j.status = 'quoted'),
        'awaiting_client_signoff',        count(*) filter (where j.status = 'work_complete'),
        'to_schedule',                    count(*) filter (where j.status = 'approved'),
        'in_progress',                    count(*) filter (where j.status = 'in_progress'),
        'new_requests',                   count(*) filter (where j.status = 'requested'),
        'on_hold',                        count(*) filter (where j.status = 'on_hold'),
        -- Scheduled to start today, in the ORG's timezone. Using the server's
        -- date would put a 7am job in the wrong bucket for anyone west of
        -- UTC, which is most of the world.
        'scheduled_today', count(*) filter (
          where j.scheduled_start is not null
            and (j.scheduled_start at time zone o.timezone)::date = (now() at time zone o.timezone)::date
        ),
        'overdue_schedule', count(*) filter (
          where j.scheduled_end is not null
            and j.scheduled_end < now()
            and j.status in ('scheduled', 'in_progress')
        )
      )
      from public.jobs j
      cross join public.organizations o
      where j.org_id = p_org_id and o.id = p_org_id
    ),
    'quotes', (
      select jsonb_build_object(
        'awaiting_decision', count(*) filter (where q.status = 'sent'),
        'awaiting_decision_cents', coalesce(sum(q.total_cents) filter (where q.status = 'sent'), 0),
        -- Sent, still undecided, and past its date. Chasing these is the
        -- highest-value thing on this screen.
        'expired', count(*) filter (
          where q.status = 'sent' and q.valid_until is not null and q.valid_until < current_date
        )
      )
      from public.quotes q
      where q.org_id = p_org_id
    ),
    'invoices', (
      select jsonb_build_object
      (
        'unpaid', count(*) filter (where i.status = 'sent'),
        'unpaid_cents', coalesce(sum(i.total_cents) filter (where i.status = 'sent'), 0),
        'overdue', count(*) filter (
          where i.status = 'sent' and i.due_at is not null and i.due_at < current_date
        ),
        'overdue_cents', coalesce(sum(i.total_cents) filter (
          where i.status = 'sent' and i.due_at is not null and i.due_at < current_date
        ), 0),
        'draft', count(*) filter (where i.status = 'draft'),
        -- Paid in the last 30 days, so the number means "recent income"
        -- rather than "everything we have ever been paid", which only grows.
        'paid_30d_cents', coalesce(sum(i.total_cents) filter (
          where i.status = 'paid' and i.paid_at >= now() - interval '30 days'
        ), 0)
      )
      from public.invoices i
      where i.org_id = p_org_id
    ),
    'currency', (select o.currency from public.organizations o where o.id = p_org_id)
  );
$$;

revoke execute on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid) to authenticated;

comment on function public.dashboard_summary(uuid) is
  'One-round-trip dashboard counts. SECURITY INVOKER: every count is filtered '
  'by the caller''s own RLS, so a tech gets zeroes for anything priced.';
