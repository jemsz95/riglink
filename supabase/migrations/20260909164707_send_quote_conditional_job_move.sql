-- ============================================================================
-- Fix: sending a quote must not force an illegal job transition.
--
-- The previous version moved the job to `quoted` unconditionally. That works
-- for the first quote but makes a SECOND quote impossible: once the client has
-- approved, the job is `approved`, and `approved -> quoted` is not a legal
-- staff edge, so the transition trigger aborted the whole RPC and the quote
-- silently stayed a draft. Additional or revised work after an approval is
-- ordinary, not an edge case.
--
-- The job move is now attempted only when the transition table actually allows
-- it. That keeps the property the unconditional version was reaching for --
-- you cannot quote a cancelled job, because no such edge exists -- while
-- letting a job that is already past `quoted` receive another quote without
-- being dragged backwards through its own lifecycle.
-- ============================================================================
create or replace function public.send_quote(p_quote_id uuid)
returns quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote      public.quotes;
  v_lines      integer;
  v_job_status public.job_status;
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

  select status into v_job_status from public.jobs where id = v_quote.job_id;

  -- Consult the SAME whitelist the trigger enforces, rather than attempting
  -- the write and hoping. A job already at or past `quoted` keeps its status.
  if v_job_status is distinct from 'quoted' and exists (
    select 1 from public.job_status_transitions t
    where t.from_status = v_job_status
      and t.to_status = 'quoted'
      and t.actor_kind = 'staff'
  ) then
    update public.jobs set status = 'quoted' where id = v_quote.job_id;
  end if;

  return v_quote;
end;
$$;

revoke execute on function public.send_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;
