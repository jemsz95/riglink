-- ============================================================================
-- Fix: app.decide_completion never told the trigger it was a client acting.
--
-- `app.enforce_job_status()` decides the actor from
-- `current_setting('app.actor_kind', true)` and DEFAULTS TO 'staff'. This
-- function is SECURITY DEFINER, so it runs as the table owner with no hint
-- about who called it -- and the only client edge out of `work_complete` is
-- registered for actor_kind 'client'. So the sign-off failed with
--
--   illegal job transition work_complete -> client_accepted for actor staff
--
-- at the moment a customer pressed Accept. `submit_job_request` and
-- `app.decide_quote` both call `set_config('app.actor_kind', 'client', true)`
-- before their update; this one did not, because I wrote the transition check
-- and forgot the half that makes the transition legal.
--
-- Worth noting what did NOT go wrong: the trigger refused the write rather
-- than recording a staff-attributed sign-off. The audit trail could not be
-- corrupted by this bug, only blocked -- which is the failure direction that
-- design was chosen for.
-- ============================================================================

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
  v_job      public.jobs;
  v_contact  public.client_contacts;
  v_approval uuid;
  v_moved    boolean := false;
  v_legal    boolean;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

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
    v_contact.id, (select auth.uid()), nullif(btrim(coalesce(p_note, '')), ''),
    app.completion_snapshot(p_job_id)
  )
  returning id into v_approval;

  if p_decision = 'approved' then
    select exists (
      select 1 from public.job_status_transitions t
      where t.from_status = v_job.status
        and t.to_status = 'client_accepted'
        and t.actor_kind = 'client'
    ) into v_legal;

    if v_legal then
      -- app.enforce_job_status() reads `app.actor_kind`, defaulting to
      -- 'staff'. This function runs SECURITY DEFINER as the owner, so without
      -- this the trigger sees a staff actor and refuses the edge -- which is
      -- exactly what it should do, and exactly what happened on the first
      -- real call. `true` scopes the setting to this transaction, so it cannot
      -- leak into anything the connection does afterwards.
      perform set_config('app.actor_kind', 'client', true);
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
