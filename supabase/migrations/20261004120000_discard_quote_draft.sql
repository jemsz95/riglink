-- ============================================================================
-- Discarding a quote draft.
--
-- `supersede_quote` marks the old quote `superseded` the moment the revision
-- draft is created, not when the revision is sent. So a revision draft cannot
-- simply be deleted: the quote it replaced would stay `superseded`, which
-- `supersede_quote` refuses to revise again, and the job would be left with
-- no live quote and no way to make one.
--
-- Nothing recorded which quote a revision replaced, nor what status that
-- quote had (`sent` or `expired`) before it was superseded. This adds both,
-- on the revision, and `discard_quote_draft` uses them to put the replaced
-- quote back exactly as it was.
-- ============================================================================

alter table public.quotes
  add column supersedes_id     uuid,
  add column supersedes_status public.quote_status,
  -- Same tenant by construction, as with every other cross-row reference.
  add constraint quotes_supersedes_fk
    foreign key (supersedes_id, org_id) references public.quotes (id, org_id),
  -- A quote is replaced by at most one revision. Discarding the revision
  -- deletes it, which frees the slot for the next one.
  add constraint quotes_supersedes_key unique (supersedes_id),
  add constraint quotes_supersedes_pair
    check ((supersedes_id is null) = (supersedes_status is null)),
  add constraint quotes_supersedes_status_restorable
    check (supersedes_status in ('sent', 'expired'));

comment on column public.quotes.supersedes_id is
  'The quote this revision replaced. Null for a job''s first quote.';
comment on column public.quotes.supersedes_status is
  'The replaced quote''s status before it was superseded, so discarding this '
  'revision while it is still a draft can restore it.';

-- ----------------------------------------------------------------------------
-- Backfill revision drafts that already exist.
--
-- Their predecessor is the newest superseded quote on the same job created
-- before them; `supersede_quote` has only ever left one such candidate per
-- live draft. The prior status was not recorded, so it is inferred from the
-- validity date: a quote past `valid_until` would be `expired`.
-- ----------------------------------------------------------------------------
with pairs as (
  -- `distinct on` keeps the earliest draft after each predecessor: that is the
  -- one `supersede_quote` created, and the unique link allows only one.
  select distinct on (p.id)
    d.id as draft_id,
    p.id as prev_id,
    case
      when p.valid_until is not null and p.valid_until < d.created_at::date
        then 'expired'::public.quote_status
      else 'sent'::public.quote_status
    end as prev_status
  from public.quotes d
  cross join lateral (
    select o.id, o.valid_until
    from public.quotes o
    where o.job_id = d.job_id
      and o.status = 'superseded'
      and o.created_at < d.created_at
    order by o.created_at desc
    limit 1
  ) p
  where d.status = 'draft'
  order by p.id, d.created_at
)
update public.quotes q
set supersedes_id     = pairs.prev_id,
    supersedes_status = pairs.prev_status
from pairs
where q.id = pairs.draft_id;

-- ----------------------------------------------------------------------------
-- supersede_quote: unchanged apart from recording the link.
-- ----------------------------------------------------------------------------
create or replace function public.supersede_quote(p_quote_id uuid)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.quotes;
  v_new public.quotes;
begin
  select * into v_old
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'P0002';
  end if;

  if v_old.status not in ('sent', 'expired') then
    raise exception 'quote % is %; only a sent or expired quote can be superseded',
      p_quote_id, v_old.status
      using errcode = '23514',
            hint = 'draft quotes are edited in place; approved and declined quotes are final';
  end if;

  insert into public.quotes (
    org_id, job_id, client_id, notes, terms, valid_until, created_by,
    supersedes_id, supersedes_status
  )
  values (v_old.org_id, v_old.job_id, v_old.client_id, v_old.notes, v_old.terms,
          v_old.valid_until, (select auth.uid()),
          v_old.id, v_old.status)
  returning * into v_new;

  -- Carry the internal note across too. It is staff context on the work, not
  -- on the document, so a revision should not silently lose it.
  insert into public.quote_internal_notes (quote_id, org_id, notes, updated_by)
  select v_new.id, v_new.org_id, qn.notes, (select auth.uid())
  from public.quote_internal_notes qn
  where qn.quote_id = p_quote_id;

  insert into public.quote_line_items (
    org_id, quote_id, client_id, position, kind, catalog_item_id,
    description, unit, quantity, unit_price_cents, tax_rate
  )
  select l.org_id, v_new.id, l.client_id, l.position, l.kind, l.catalog_item_id,
         l.description, l.unit, l.quantity, l.unit_price_cents, l.tax_rate
  from public.quote_line_items l
  where l.quote_id = p_quote_id
  order by l.position;

  update public.quotes set status = 'superseded' where id = p_quote_id;

  return v_new;
end;
$$;

-- ----------------------------------------------------------------------------
-- discard_quote_draft
--
-- Deletes a draft and, if it was a revision, restores the quote it replaced
-- in the same transaction. SECURITY INVOKER: `quotes_admin_delete_draft`
-- decides who may discard (owners and admins, drafts only), exactly as it
-- would for a direct DELETE. A caller the policy refuses deletes nothing, and
-- that is raised rather than returned as a silent no-op -- otherwise the
-- restore below would run for someone who could not discard.
-- ----------------------------------------------------------------------------
create or replace function public.discard_quote_draft(p_quote_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_draft   public.quotes;
  v_deleted integer;
begin
  select * into v_draft
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'P0002';
  end if;

  if v_draft.status <> 'draft' then
    raise exception 'quote % is %; only a draft can be discarded',
      p_quote_id, v_draft.status
      using errcode = '23514',
            hint = 'a quote the client has seen is superseded, never deleted';
  end if;

  -- Lock the replaced quote before touching either row, so a concurrent
  -- supersede or decision cannot slip between the delete and the restore.
  if v_draft.supersedes_id is not null then
    perform 1 from public.quotes where id = v_draft.supersedes_id for update;
  end if;

  -- Lines and the internal note go with it: both cascade from the quote.
  delete from public.quotes where id = p_quote_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'not permitted to discard quote %', p_quote_id
      using errcode = '42501',
            hint = 'only owners and admins can discard a draft';
  end if;

  if v_draft.supersedes_id is not null then
    update public.quotes
    set status = v_draft.supersedes_status
    where id = v_draft.supersedes_id
      and status = 'superseded';
  end if;
end;
$$;

comment on function public.discard_quote_draft(uuid) is
  'Deletes a draft quote. If it was a revision, the quote it replaced returns '
  'to the status it had before, so the job is never left without a live quote.';

revoke execute on function public.discard_quote_draft(uuid) from public, anon;
grant execute on function public.discard_quote_draft(uuid) to authenticated;
