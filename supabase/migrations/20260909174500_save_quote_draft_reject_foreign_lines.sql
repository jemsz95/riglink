-- ============================================================================
-- save_quote_draft: reject line ids belonging to another quote, loudly.
--
-- THE BUG
--
-- The first version guarded the upsert with `on conflict (id) do update ...
-- where t.quote_id = p_quote_id`, so an incoming line whose id lives on a
-- different quote could not overwrite it. That half worked -- the other quote
-- was untouched -- but ON CONFLICT ... DO UPDATE with a WHERE that fails
-- simply skips the row. No error. So the incoming line was dropped on the
-- floor while the target quote's own lines had already been deleted for not
-- appearing in the incoming set.
--
-- Result, verified: quote #1 kept its correct line, and quote #2 was left with
-- zero lines and a success response. Silent data loss reported as a save --
-- the precise failure this RPC was written to eliminate.
--
-- It is not a malicious-input case. supersede_quote copies lines to NEW ids,
-- so an editor tab left open across a supersede holds ids that now belong to
-- the superseded quote. The next autosave from that tab would empty the new
-- draft.
--
-- THE FIX
--
-- Check first, and raise. A save that cannot be applied exactly as asked must
-- fail, so the client keeps its unsaved state and can tell the user, rather
-- than being told everything is fine.
--
-- The check joins `quote_line_items` under RLS, so it sees only ids in the
-- caller's own tenant -- which is the case worth naming, because it is the one
-- RLS permits. An id from another tenant is invisible here, and the insert
-- then fails on the unique index instead: also an error, also not silent.
--
-- The `where t.quote_id = p_quote_id` clause stays on the upsert. It is now
-- unreachable for same-tenant ids, and that is the point of keeping it: it is
-- the backstop if this pre-check is ever weakened.
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
  v_quote   public.quotes;
  v_foreign uuid;
begin
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines), 'null')
      using errcode = '22023';
  end if;

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

  -- Refuse before deleting anything.
  select q.id into v_foreign
  from jsonb_to_recordset(p_lines) as l(id text)
  join public.quote_line_items q on q.id = nullif(l.id, '')::uuid
  where q.quote_id <> p_quote_id
  limit 1;

  if v_foreign is not null then
    raise exception 'line % belongs to a different quote', v_foreign
      using errcode = '23514',
            hint = 'reload the quote: these line ids are from a superseded or unrelated revision';
  end if;

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
  where t.quote_id = p_quote_id;

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

revoke execute on function public.save_quote_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_draft(uuid, jsonb, jsonb) to authenticated;
