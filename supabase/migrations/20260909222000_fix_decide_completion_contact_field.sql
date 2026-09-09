-- ============================================================================
-- Fix: app.decide_completion referenced a field that does not exist.
--
-- `app.portal_contact_for()` returns a `public.client_contacts` ROW, so the
-- contact's id is `.id`. The first version declared `v_contact record` and
-- read `v_contact.contact_id`, which plpgsql resolves at execution -- so the
-- migration applied cleanly and the function would have failed on its first
-- real call, at the moment a customer pressed "Accept". `app.decide_quote`
-- gets this right by declaring the variable as `public.client_contacts`, which
-- makes the field names checked against the row type instead of guessed; this
-- now does the same.
--
-- Found by checking the function's declared return type before testing rather
-- than after.
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
