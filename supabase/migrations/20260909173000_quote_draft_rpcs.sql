-- ============================================================================
-- save_quote_draft / supersede_quote: make two multi-step writes atomic.
--
-- THE BUG THIS FIXES
--
-- Both operations were assembled in the browser out of independent PostgREST
-- requests, and PostgREST gives each request its own transaction. There is no
-- way to span them from the client.
--
--   useSaveQuoteDraft   3 requests: update header, delete removed lines,
--                                   upsert remaining lines
--   useSupersedeQuote   4 requests: read lines, insert new quote, copy lines,
--                                   mark the old one superseded
--
-- Every gap between those requests is a state a user can be left in. The save
-- path is the worse of the two: the DELETE lands first, so a dropped
-- connection, a closed laptop or a failed retry between requests two and
-- three leaves the quote with lines destroyed and nothing put back. It is
-- driven by an 800ms autosave debounce, so it fires constantly, unattended,
-- on whatever network the user happens to have. The supersede path can leave
-- an orphan draft with no lines, or a live quote with no replacement.
--
-- Neither is hypothetical, and neither is fixable in the client. Retries make
-- it worse, not better: a retry of request three after a successful delete
-- still cannot restore what the client no longer has if its own state was
-- lost. Moving both into the database gives them the transaction they always
-- needed, and collapses 3 and 4 round trips into 1 -- which on a phone on
-- site is the difference the field crew will actually notice.
--
-- SECURITY INVOKER, deliberately, like send_quote. Staff already hold the
-- policies for everything these touch, so a definer function would take on
-- the job of re-deriving permission it does not need. As invoker, RLS decides
-- exactly as it would have for the original requests: `for update` returning
-- no row IS the authorisation failure, and the lock trigger still refuses a
-- sent quote even to an owner.
--
-- The line array carries no org_id or client_id. Both are read from the quote
-- row under lock, so a caller cannot post lines that claim to belong to
-- another tenant and lean on a policy to catch it.
--
-- `quantity` and `tax_rate` arrive as JSON strings and are cast text ->
-- numeric here, never through a double. That is the same invariant the wire
-- format already had, now enforced at the point of parse: `jsonb_to_recordset`
-- is declared with them as `text` so a JSON number could not sneak in and
-- round.
-- ============================================================================

create or replace function public.save_quote_draft(
  p_quote_id uuid,
  p_lines    jsonb,
  p_header   jsonb default '{}'::jsonb
)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines), 'null')
      using errcode = '22023';
  end if;

  -- RLS applies: a quote the caller cannot see simply is not found, which is
  -- the same answer as one that does not exist. The row lock serialises
  -- concurrent autosaves from two tabs.
  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'P0002';
  end if;

  if v_quote.locked_at is not null then
    raise exception 'quote % is locked (sent %); its draft cannot be edited',
      p_quote_id, v_quote.sent_at
      using errcode = '23514', hint = 'supersede the quote with a new revision instead';
  end if;

  -- Deletes before upserts. `unique (quote_id, position)` is DEFERRABLE
  -- INITIALLY DEFERRED, so it is checked once at commit rather than per row,
  -- and a reorder that momentarily duplicates a position is fine -- but
  -- freeing vacated positions first keeps the intermediate state sane for
  -- anything that reads mid-transaction.
  delete from public.quote_line_items q
  where q.quote_id = p_quote_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_lines) as l(id text)
      where nullif(l.id, '') is not null
        and l.id::uuid = q.id
    );

  insert into public.quote_line_items as t (
    id, org_id, quote_id, client_id, position, kind, catalog_item_id,
    description, unit, quantity, unit_price_cents, tax_rate
  )
  select
    coalesce(nullif(l.id, '')::uuid, gen_random_uuid()),
    v_quote.org_id,
    p_quote_id,
    v_quote.client_id,
    l.position,
    coalesce(nullif(l.kind, ''), 'material')::public.line_kind,
    nullif(l.catalog_item_id, '')::uuid,
    l.description,
    coalesce(nullif(l.unit, ''), 'each'),
    l.quantity::numeric,
    l.unit_price_cents,
    coalesce(nullif(l.tax_rate, ''), '0')::numeric
  from jsonb_to_recordset(p_lines) as l(
    id               text,
    position         integer,
    kind             text,
    catalog_item_id  text,
    description      text,
    unit             text,
    quantity         text,
    unit_price_cents bigint,
    tax_rate         text
  )
  on conflict (id) do update set
    position         = excluded.position,
    kind             = excluded.kind,
    catalog_item_id  = excluded.catalog_item_id,
    description      = excluded.description,
    unit             = excluded.unit,
    quantity         = excluded.quantity,
    unit_price_cents = excluded.unit_price_cents,
    tax_rate         = excluded.tax_rate
  -- Belt on the tenant columns: an `id` naming a line on someone else's quote
  -- would otherwise be an UPDATE targeting it. RLS would refuse, but saying so
  -- here means the intent is not left to the policy alone.
  where t.quote_id = p_quote_id;

  -- Header last. Only keys actually present in p_header are written, so an
  -- autosave that carries lines alone cannot blank the notes, and the
  -- BEFORE UPDATE totals guard re-derives subtotal/tax/total from the lines
  -- as they now stand.
  update public.quotes q
  set notes         = case when p_header ? 'notes'         then p_header ->> 'notes'         else q.notes end,
      terms         = case when p_header ? 'terms'         then p_header ->> 'terms'         else q.terms end,
      internal_note = case when p_header ? 'internal_note' then p_header ->> 'internal_note' else q.internal_note end,
      valid_until   = case when p_header ? 'valid_until'
                           then nullif(p_header ->> 'valid_until', '')::date
                           else q.valid_until end
  where q.id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

comment on function public.save_quote_draft(uuid, jsonb, jsonb) is
  'Replaces a draft quote''s lines and header in one transaction. SECURITY '
  'INVOKER: RLS and the lock trigger decide. Supersedes the former '
  'three-request client-side save, which could destroy lines on a partial '
  'failure.';

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

  -- Only a quote the client has actually seen can be superseded. A draft is
  -- edited in place, and an approved quote is a commitment: further work gets
  -- its own quote on the same job, which is why this refuses rather than
  -- quietly replacing it.
  if v_old.status not in ('sent', 'expired') then
    raise exception 'quote % is %; only a sent or expired quote can be superseded',
      p_quote_id, v_old.status
      using errcode = '23514',
            hint = 'draft quotes are edited in place; approved and declined quotes are final';
  end if;

  -- `number` is assigned by the per-org sequence trigger, and the three totals
  -- by the header guard, so none of the four is supplied here.
  insert into public.quotes (org_id, job_id, client_id, notes, terms, internal_note, valid_until, created_by)
  values (v_old.org_id, v_old.job_id, v_old.client_id, v_old.notes, v_old.terms,
          v_old.internal_note, v_old.valid_until, auth.uid())
  returning * into v_new;

  insert into public.quote_line_items (
    org_id, quote_id, client_id, position, kind, catalog_item_id,
    description, unit, quantity, unit_price_cents, tax_rate
  )
  select l.org_id, v_new.id, l.client_id, l.position, l.kind, l.catalog_item_id,
         l.description, l.unit, l.quantity, l.unit_price_cents, l.tax_rate
  from public.quote_line_items l
  where l.quote_id = p_quote_id
  order by l.position;

  -- The old quote stays on the record. The client saw it, so it is marked,
  -- never deleted. `locked_at` is already set -- `quotes_sent_has_lock`
  -- requires it for any non-draft status -- so this passes unchanged.
  update public.quotes set status = 'superseded' where id = p_quote_id;

  return v_new;
end;
$$;

comment on function public.supersede_quote(uuid) is
  'Replaces a sent or expired quote with a fresh draft carrying its lines '
  'across, in one transaction. Supersedes the former four-request client-side '
  'sequence, which could leave an orphan draft or a job with no live quote.';

revoke execute on function public.save_quote_draft(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.supersede_quote(uuid) from public, anon;
grant execute on function public.save_quote_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.supersede_quote(uuid) to authenticated;
