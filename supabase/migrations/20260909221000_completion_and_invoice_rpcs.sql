-- ============================================================================
-- Completion sign-off and invoice creation.
--
-- Two client-side writes (definer, guarded) and two staff-side writes
-- (invoker), following the split Phase 3 settled on: a definer function only
-- where the caller deliberately has no policy for what it does.
--
-- THE DECLINE ASYMMETRY, ON PURPOSE
--
-- `accept_completion` moves the job work_complete -> client_accepted, because
-- `job_status_transitions` holds that edge with actor_kind = 'client'.
-- `decline_completion` records the decision and moves NOTHING, because there
-- is no client edge out of work_complete for a rejection -- and there should
-- not be. A customer saying "this isn't finished" is information for the
-- dispatcher, not a unilateral reopening of the job: someone has to decide
-- whether to send a van back or argue. So the approval row is written, the
-- staff app surfaces it, and a human moves the job.
--
-- This is the same conditional-move discipline that fixed the Phase 3 bug
-- where send_quote and decide_quote moved the job unconditionally and aborted
-- the whole transaction on the second quote for a job.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A snapshot of what the client accepted.
--
-- Frozen for the same reason as the quote snapshot: "we never agreed to that"
-- is answerable only if the record contains what they were shown. Includes the
-- client-visible evidence, because on a completion sign-off the photos ARE the
-- substance of what is being accepted.
-- ----------------------------------------------------------------------------

create or replace function app.completion_snapshot(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshot_version', 1,
    'taken_at', now(),
    'job', jsonb_build_object(
      'id', j.id,
      'number', j.number,
      'title', j.title,
      'description', j.description,
      'completed_at', j.completed_at,
      'scheduled_start', j.scheduled_start,
      'scheduled_end', j.scheduled_end
    ),
    'approved_quote', (
      select jsonb_build_object(
               'id', q.id, 'number', q.number, 'currency', q.currency,
               'subtotal_cents', q.subtotal_cents, 'tax_cents', q.tax_cents,
               'total_cents', q.total_cents
             )
      from public.quotes q
      where q.job_id = j.id and q.status = 'approved'
      order by q.decided_at desc nulls last, q.number desc
      limit 1
    ),
    'evidence', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', e.id, 'kind', e.kind, 'caption', e.caption,
                 'body', e.body, 'captured_at', e.captured_at,
                 'storage_path', e.storage_path
               )
               order by coalesce(e.captured_at, e.created_at)
             )
      from public.job_evidence e
      where e.job_id = j.id and e.client_visible
    ), '[]'::jsonb)
  )
  from public.jobs j
  where j.id = p_job_id;
$$;

revoke execute on function app.completion_snapshot(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.decide_completion -- the shared body, like app.decide_quote.
-- ----------------------------------------------------------------------------

create or replace function app.decide_completion(
  p_job_id   uuid,
  p_decision public.approval_decision,
  p_note     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job        public.jobs;
  v_contact    record;
  v_approval   uuid;
  v_moved      boolean := false;
  v_legal      boolean;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  -- Authorises the caller AND proves they belong to this job's client. A
  -- viewer contact is refused here, not in the UI.
  v_contact := app.portal_contact_for(v_job.client_id, true);

  if v_job.status <> 'work_complete' then
    raise exception 'job % is %; only work marked complete can be signed off',
      p_job_id, v_job.status
      using errcode = '23514',
            hint = 'the contractor has not marked this work complete yet';
  end if;

  if exists (
    select 1 from public.approvals a
    where a.job_id = p_job_id and a.kind = 'completion'
  ) then
    raise exception 'this job has already been signed off'
      using errcode = '23514';
  end if;

  insert into public.approvals (
    org_id, job_id, client_id, quote_id, kind, decision,
    actor_contact_id, actor_user_id, note, snapshot
  ) values (
    v_job.org_id, p_job_id, v_job.client_id, null, 'completion', p_decision,
    v_contact.contact_id, (select auth.uid()), nullif(btrim(coalesce(p_note, '')), ''),
    app.completion_snapshot(p_job_id)
  )
  returning id into v_approval;

  -- Only an acceptance has an edge to travel. A decline is recorded and left
  -- for a person -- see the header.
  if p_decision = 'approved' then
    select exists (
      select 1 from public.job_status_transitions t
      where t.from_status = v_job.status
        and t.to_status = 'client_accepted'
        and t.actor_kind = 'client'
    ) into v_legal;

    if v_legal then
      update public.jobs
      set status = 'client_accepted',
          completed_at = coalesce(completed_at, now())
      where id = p_job_id;
      v_moved := true;
    end if;
  end if;

  return jsonb_build_object(
    'job_id', p_job_id,
    'approval_id', v_approval,
    'decision', p_decision,
    'job_status_changed', v_moved,
    'decided_at', now()
  );
end;
$$;

revoke execute on function app.decide_completion(uuid, public.approval_decision, text)
  from public, anon, authenticated;

create or replace function public.accept_completion(p_job_id uuid, p_note text default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.decide_completion(p_job_id, 'approved', p_note);
$$;

create or replace function public.decline_completion(p_job_id uuid, p_note text default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.decide_completion(p_job_id, 'declined', p_note);
$$;

-- ----------------------------------------------------------------------------
-- Raising an invoice.
--
-- SECURITY INVOKER: dispatch roles already hold every policy this touches, so
-- a definer function would be taking on authorisation it does not need. The
-- lines are copied from the approved quote in the same transaction as the
-- header, because an invoice with no lines that someone then sends is worse
-- than a failure.
-- ----------------------------------------------------------------------------

create or replace function public.create_invoice_from_job(p_job_id uuid)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job     public.jobs;
  v_org     public.organizations;
  v_quote   public.quotes;
  v_invoice public.invoices;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  -- A live draft already exists: hand it back rather than making a second one.
  -- Two drafts for one job is how the wrong one gets sent.
  select * into v_invoice
  from public.invoices
  where job_id = p_job_id and status = 'draft'
  order by number desc
  limit 1;
  if found then
    return v_invoice;
  end if;

  select * into v_org from public.organizations where id = v_job.org_id;

  select * into v_quote
  from public.quotes
  where job_id = p_job_id and status = 'approved'
  order by decided_at desc nulls last, number desc
  limit 1;

  insert into public.invoices (
    org_id, job_id, client_id, quote_id, currency, notes, terms, due_at, created_by
  ) values (
    v_job.org_id, p_job_id, v_job.client_id, v_quote.id,
    coalesce(v_quote.currency, v_org.currency),
    v_quote.notes,
    v_quote.terms,
    -- Terms come from the org. A due date in the past because nobody set
    -- terms is a collections problem, so it falls back to 30 days.
    (current_date + coalesce(v_org.invoice_terms_days, 30)),
    (select auth.uid())
  )
  returning * into v_invoice;

  if v_quote.id is not null then
    insert into public.invoice_line_items (
      org_id, invoice_id, client_id, position, kind, catalog_item_id,
      description, unit, quantity, unit_price_cents, tax_rate
    )
    select l.org_id, v_invoice.id, l.client_id, l.position, l.kind,
           l.catalog_item_id, l.description, l.unit, l.quantity,
           l.unit_price_cents, l.tax_rate
    from public.quote_line_items l
    where l.quote_id = v_quote.id
    order by l.position;

    -- Re-read: the statement trigger has recomputed the header totals.
    select * into v_invoice from public.invoices where id = v_invoice.id;
  end if;

  return v_invoice;
end;
$$;

-- ----------------------------------------------------------------------------
-- Issuing it.
-- ----------------------------------------------------------------------------

create or replace function public.send_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_lines   integer;
  v_legal   boolean;
  v_status  public.job_status;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice % is already %', p_invoice_id, v_invoice.status
      using errcode = '23514';
  end if;

  select count(*) into v_lines
  from public.invoice_line_items where invoice_id = p_invoice_id;
  if v_lines = 0 then
    raise exception 'invoice % has no lines', p_invoice_id
      using errcode = '23514', hint = 'add at least one line before issuing';
  end if;

  update public.invoices
  set status = 'sent', issued_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  -- Conditional, like send_quote: consult the transition table first. A job
  -- already closed, or invoiced from an earlier invoice, must not abort this
  -- transaction on the status trigger.
  select j.status into v_status from public.jobs j where j.id = v_invoice.job_id;
  select exists (
    select 1 from public.job_status_transitions t
    where t.from_status = v_status
      and t.to_status = 'invoiced'
      and t.actor_kind = 'staff'
  ) into v_legal;

  if v_legal then
    update public.jobs set status = 'invoiced' where id = v_invoice.job_id;
  end if;

  return v_invoice;
end;
$$;

revoke execute on function public.accept_completion(uuid, text) from public, anon;
revoke execute on function public.decline_completion(uuid, text) from public, anon;
revoke execute on function public.create_invoice_from_job(uuid) from public, anon;
revoke execute on function public.send_invoice(uuid) from public, anon;
grant execute on function public.accept_completion(uuid, text) to authenticated;
grant execute on function public.decline_completion(uuid, text) to authenticated;
grant execute on function public.create_invoice_from_job(uuid) to authenticated;
grant execute on function public.send_invoice(uuid) to authenticated;
