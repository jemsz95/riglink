-- ============================================================================
-- Fix: deciding a quote must not force an illegal job transition.
--
-- Same defect as 20260909164707, on the client's side of the loop. Once a job
-- is `approved` (from an earlier quote), a decision on a LATER quote tried
-- `approved -> approved/declined`, which is not a legal client edge, so the
-- transition trigger aborted the transaction -- taking the approvals row and
-- the quote's own status change with it. The client pressed Approve and
-- nothing happened.
--
-- The decision on the QUOTE is always recorded; the JOB moves only when the
-- transition table permits it. That is the right split: a second quote being
-- declined does not undo an approval the client already gave, and the first
-- approval stays the job's state.
-- ============================================================================
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
  v_quote      public.quotes;
  v_contact    public.client_contacts;
  v_snapshot   jsonb;
  v_approval   public.approvals;
  v_job_status public.job_status;
  v_target     public.job_status;
  v_job_moved  boolean := false;
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

  -- The transition table is the authority on whether the JOB can follow.
  v_target := (case when p_decision = 'approved' then 'approved'
                    else 'declined' end)::public.job_status;
  select status into v_job_status from public.jobs where id = v_quote.job_id;

  if v_job_status is distinct from v_target and exists (
    select 1 from public.job_status_transitions t
    where t.from_status = v_job_status
      and t.to_status = v_target
      and t.actor_kind = 'client'
  ) then
    perform set_config('app.actor_kind', 'client', true);
    update public.jobs set status = v_target where id = v_quote.job_id;
    v_job_moved := true;
  end if;

  return jsonb_build_object(
    'approval_id', v_approval.id,
    'quote_id', v_quote.id,
    'quote_status', v_quote.status,
    'decided_at', v_quote.decided_at,
    -- Told to the caller rather than inferred: the UI needs to know whether
    -- the job itself advanced, which it does not for a later quote on a job
    -- that is already under way.
    'job_status_changed', v_job_moved
  );
end;
$$;

revoke execute on function app.decide_quote(uuid, approval_decision, text)
  from public, anon, authenticated;
