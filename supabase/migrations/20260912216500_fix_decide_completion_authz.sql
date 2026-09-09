-- ============================================================================
-- Authorization gap: anyone could sign off anyone's completed work.
--
-- app.decide_quote() null-checks the contact and raises 42501. Its sibling
-- app.decide_completion() assigned the same value and never checked it:
--
--   v_contact := app.portal_contact_for(v_job.client_id, true);
--   -- and then straight on to the insert
--
-- app.portal_contact_for() returns a NULL ROW when nobody matches -- not zero
-- rows -- so v_contact.id was simply null. decide_completion is SECURITY
-- DEFINER, so its `select * into v_job from public.jobs` bypasses RLS and
-- found the job regardless of who was asking, and approvals.actor_contact_id
-- is nullable, so the insert succeeded.
--
-- Net effect: ANY authenticated user holding the UUID of a job in
-- `work_complete` could call public.accept_completion() and sign the work off,
-- recording an approval with no actor. A `viewer` contact reached it too,
-- despite p_require_approver = true, because the restriction that argument
-- applies only narrows which row comes back -- it cannot report its absence.
--
-- The fix is the guard decide_quote already uses. Nothing else changes.
-- ============================================================================

create or replace function app.decide_completion(
  p_job_id   uuid,
  p_decision public.approval_decision,
  p_note     text default null
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

  -- THE FIX. portal_contact_for returns a null ROW, not no row, so this is the
  -- only thing standing between a job uuid and a forged sign-off.
  if v_contact.id is null then
    raise exception 'not authorised to sign off this job'
      using errcode = '42501';
  end if;

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
