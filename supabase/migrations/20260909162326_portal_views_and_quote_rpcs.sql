-- ============================================================================
-- The approval loop: portal projections, and the writes that cross the
-- staff/client boundary.
--
-- Two mechanisms, chosen per direction:
--
--   * Reads use `security_invoker = on` views. The view narrows COLUMNS
--     (internal_notes, access_notes, internal_note never leave the server);
--     RLS on the base table narrows ROWS. Both are needed -- a view alone
--     would show every tenant, and a policy alone would show staff-only
--     columns.
--
--   * Writes by staff use SECURITY INVOKER functions, because staff already
--     hold the policies. Only the client's writes use SECURITY DEFINER, and
--     only because a portal contact deliberately has NO update policy on
--     `jobs` or `quotes` at all.
--
-- `with (security_invoker = on)` is mandatory on every view here. The pre-PG15
-- default runs a view as its OWNER, silently bypassing RLS -- one forgotten
-- flag on a portal view exposes every tenant's data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cosmetic fix carried from 20260909161713: the raise used `%s`, but plpgsql's
-- only placeholder is `%`, so the message rendered a stray trailing "s".
-- Corrected here rather than by editing an applied migration, so the file
-- history keeps matching what was actually deployed.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_quote_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_locked   timestamptz;
begin
  select locked_at into v_locked from public.quotes where id = v_quote_id;

  if v_locked is not null then
    raise exception
      'quote % is locked (sent %); its line items cannot be changed',
      v_quote_id, v_locked
      using errcode = 'check_violation',
            hint = 'supersede the quote with a new revision instead';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal projections.
-- ---------------------------------------------------------------------------

create view portal_job_v with (security_invoker = on) as
select
  j.id, j.org_id, j.client_id, j.site_id,
  j.number, j.title, j.description,
  j.status, j.priority, j.source,
  j.requested_for, j.scheduled_start, j.scheduled_end,
  j.completed_at, j.created_at, j.updated_at
from jobs j;

comment on view portal_job_v is
  'Client-safe projection of jobs. Omits internal_notes and lead_tech_id. '
  'Row visibility comes from jobs_portal_select, which also hides drafts.';

create view portal_site_v with (security_invoker = on) as
select
  s.id, s.org_id, s.client_id,
  s.name, s.address, s.timezone, s.lat, s.lng,
  s.site_contact_name, s.site_contact_phone
from sites s;

comment on view portal_site_v is
  'Omits access_notes -- gate codes and key-safe locations are staff-only.';

create view portal_quote_v with (security_invoker = on) as
select
  q.id, q.org_id, q.job_id, q.client_id,
  q.number, q.status, q.currency,
  q.subtotal_cents, q.tax_cents, q.total_cents,
  q.notes, q.terms, q.valid_until,
  q.sent_at, q.decided_at, q.created_at, q.updated_at
from quotes q;

comment on view portal_quote_v is
  'Omits internal_note. Row visibility comes from quotes_portal_select, which '
  'excludes drafts so staff can prepare a quote unobserved.';

create view portal_quote_line_v with (security_invoker = on) as
select
  li.id, li.org_id, li.quote_id, li.client_id,
  li.position, li.kind, li.description, li.unit,
  li.quantity, li.unit_price_cents, li.tax_rate,
  li.line_total_cents, li.line_tax_cents
from quote_line_items li;

grant select on public.portal_job_v, public.portal_site_v,
                public.portal_quote_v, public.portal_quote_line_v
  to authenticated;

-- ---------------------------------------------------------------------------
-- Who is the caller, as a client contact?
--
-- Shared by every portal RPC so the authorization rule exists once. Returns
-- the contact row for a given client, or NULL. `p_require_approver` excludes
-- the `viewer` role, which may read but never decide.
-- ---------------------------------------------------------------------------
create or replace function app.portal_contact_for(
  p_client_id uuid,
  p_require_approver boolean default false
)
returns client_contacts
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.client_contacts c
  where c.client_id = p_client_id
    and c.user_id = (select auth.uid())
    and c.revoked_at is null
    and c.accepted_at is not null
    and (not p_require_approver or c.role in ('primary', 'standard'))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- submit_job_request(): the portal's only write to `jobs`.
--
-- Inserts as `draft` and then transitions to `requested` rather than
-- inserting `requested` outright. The status trigger fires on UPDATE only, so
-- a direct insert would skip both the transition check and the audit row --
-- the client's own submission would be the one event missing from the job's
-- history.
-- ---------------------------------------------------------------------------
create or replace function public.submit_job_request(
  p_client_id uuid,
  p_title text,
  p_description text default null,
  p_site_id uuid default null,
  p_requested_for date default null
)
returns jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.client_contacts;
  v_client  public.clients;
  v_job     public.jobs;
begin
  v_contact := app.portal_contact_for(p_client_id);
  if v_contact.id is null then
    raise exception 'not a contact for this client' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'a short title is required'
      using errcode = 'check_violation';
  end if;

  select * into v_client from public.clients where id = p_client_id;

  -- A site must belong to the same client, or the composite FK would reject
  -- it later with an error the client cannot act on.
  if p_site_id is not null and not exists (
    select 1 from public.sites s
    where s.id = p_site_id and s.client_id = p_client_id
      and s.archived_at is null
  ) then
    raise exception 'that site does not belong to this client'
      using errcode = 'check_violation';
  end if;

  insert into public.jobs (
    org_id, client_id, site_id, title, description,
    source, requested_by_contact_id, requested_for, status
  ) values (
    v_client.org_id, p_client_id, p_site_id,
    btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    'client_portal', v_contact.id, p_requested_for, 'draft'
  )
  returning * into v_job;

  -- Marks the history row as caused by the client, not by staff.
  perform set_config('app.actor_kind', 'client', true);

  update public.jobs set status = 'requested'
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.submit_job_request(uuid, text, text, uuid, date)
  from public, anon;
grant execute on function public.submit_job_request(uuid, text, text, uuid, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- send_quote(): staff action, SECURITY INVOKER.
--
-- Invoker, deliberately. Staff already hold update policies on `quotes` and
-- `jobs`, so a definer function would turn RLS off for no benefit and add to
-- the definer attack surface. What this function provides is atomicity and
-- the invariants -- not privilege.
-- ---------------------------------------------------------------------------
create or replace function public.send_quote(p_quote_id uuid)
returns quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_lines integer;
begin
  -- RLS decides whether this row is visible at all; a tech or a portal
  -- contact simply sees nothing here and gets the same message as a bad id.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'quote not found' using errcode = '42501';
  end if;

  if v_quote.status <> 'draft' then
    raise exception 'quote % has already been sent', v_quote.number
      using errcode = 'check_violation';
  end if;

  select count(*) into v_lines
  from public.quote_line_items where quote_id = p_quote_id;
  if v_lines = 0 then
    raise exception 'a quote needs at least one line before it can be sent'
      using errcode = 'check_violation';
  end if;

  -- Sets locked_at in the same statement as the status, so there is no window
  -- in which the quote is sent but still editable.
  update public.quotes
  set status = 'sent', sent_at = now(), locked_at = now()
  where id = p_quote_id
  returning * into v_quote;

  -- Move the job along, unless it is already there. Any other current status
  -- is rejected by the transition trigger, which is the intended behaviour:
  -- you cannot quote a cancelled job.
  update public.jobs set status = 'quoted'
  where id = v_quote.job_id and status <> 'quoted';

  return v_quote;
end;
$$;

revoke execute on function public.send_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The snapshot.
--
-- Freezes exactly what the client saw: header, every line with its computed
-- totals, and the identity of the decider. Without this a later edit rewrites
-- history and the dispute becomes unwinnable -- which is why it is built
-- server-side from the rows rather than accepted from the browser.
-- ---------------------------------------------------------------------------
create or replace function app.quote_snapshot(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshot_version', 1,
    'taken_at', now(),
    'quote', jsonb_build_object(
      'id', q.id,
      'number', q.number,
      'currency', q.currency,
      'subtotal_cents', q.subtotal_cents,
      'tax_cents', q.tax_cents,
      'total_cents', q.total_cents,
      'notes', q.notes,
      'terms', q.terms,
      'valid_until', q.valid_until,
      'sent_at', q.sent_at
    ),
    'job', jsonb_build_object(
      'id', j.id, 'number', j.number, 'title', j.title
    ),
    'lines', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'position', li.position,
                 'kind', li.kind,
                 'description', li.description,
                 'unit', li.unit,
                 'quantity', li.quantity,
                 'unit_price_cents', li.unit_price_cents,
                 'tax_rate', li.tax_rate,
                 'line_total_cents', li.line_total_cents,
                 'line_tax_cents', li.line_tax_cents
               )
               order by li.position
             )
      from public.quote_line_items li
      where li.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.quotes q
  join public.jobs j on j.id = q.job_id
  where q.id = p_quote_id;
$$;

-- ---------------------------------------------------------------------------
-- approve_quote() / decline_quote(): the client's decision.
--
-- SECURITY DEFINER is unavoidable here -- a portal contact has no update
-- policy on `quotes` or `jobs` by design, so the explicit guard below IS the
-- security boundary. It checks three things: an active contact row, an
-- approver role (a `viewer` may read but never decide), and that the quote is
-- actually awaiting a decision.
-- ---------------------------------------------------------------------------
create or replace function app.decide_quote(
  p_quote_id uuid,
  p_decision approval_decision,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote    public.quotes;
  v_contact  public.client_contacts;
  v_snapshot jsonb;
  v_approval public.approvals;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'quote not found' using errcode = '42501';
  end if;

  v_contact := app.portal_contact_for(v_quote.client_id, true);
  if v_contact.id is null then
    raise exception 'not authorised to decide on this quote'
      using errcode = '42501';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'quote % is not awaiting a decision (it is %)',
      v_quote.number, v_quote.status
      using errcode = 'check_violation';
  end if;

  -- Expiry is checked at decision time rather than by a sweep job: a quote
  -- that lapsed an hour ago must not be approvable, and no scheduled task can
  -- guarantee that.
  if v_quote.valid_until is not null and v_quote.valid_until < current_date then
    raise exception 'quote % expired on %', v_quote.number, v_quote.valid_until
      using errcode = 'check_violation',
            hint = 'ask for an updated quote';
  end if;

  v_snapshot := app.quote_snapshot(p_quote_id);

  insert into public.approvals (
    org_id, job_id, client_id, quote_id, kind, decision,
    actor_contact_id, actor_user_id, note, snapshot
  ) values (
    v_quote.org_id, v_quote.job_id, v_quote.client_id, v_quote.id,
    'quote', p_decision,
    v_contact.id, (select auth.uid()),
    nullif(btrim(coalesce(p_note, '')), ''), v_snapshot
  )
  returning * into v_approval;

  update public.quotes
  set status = (case when p_decision = 'approved' then 'approved'
                     else 'declined' end)::public.quote_status,
      decided_at = now()
  where id = p_quote_id
  returning * into v_quote;

  -- The transition table has exactly two client edges from `quoted`, so this
  -- is validated against the same whitelist staff actions are.
  perform set_config('app.actor_kind', 'client', true);

  update public.jobs
  set status = (case when p_decision = 'approved' then 'approved'
                     else 'declined' end)::public.job_status
  where id = v_quote.job_id;

  return jsonb_build_object(
    'approval_id', v_approval.id,
    'quote_id', v_quote.id,
    'quote_status', v_quote.status,
    'decided_at', v_quote.decided_at
  );
end;
$$;

create or replace function public.approve_quote(
  p_quote_id uuid,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.decide_quote(p_quote_id, 'approved'::public.approval_decision, p_note);
$$;

create or replace function public.decline_quote(
  p_quote_id uuid,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.decide_quote(p_quote_id, 'declined'::public.approval_decision, p_note);
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so granting to
-- `authenticated` is not enough on its own -- `anon` would still reach these.
revoke execute on function public.approve_quote(uuid, text) from public, anon;
revoke execute on function public.decline_quote(uuid, text) from public, anon;
revoke execute on function app.decide_quote(uuid, approval_decision, text)
  from public, anon, authenticated;
revoke execute on function app.quote_snapshot(uuid) from public, anon, authenticated;
revoke execute on function app.portal_contact_for(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.approve_quote(uuid, text) to authenticated;
grant execute on function public.decline_quote(uuid, text) to authenticated;
