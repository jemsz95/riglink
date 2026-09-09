-- ============================================================================
-- Fix: app.assign_invoice_number passed an explicit NULL period.
--
-- `app.next_number(p_org, p_kind, p_period)` has a default for `p_period`, and
-- `number_sequences.period` is NOT NULL with a `''` default -- so the sequence
-- key for a non-periodic counter is the empty string, not null.
-- `app.assign_quote_number` therefore calls `app.next_number(org, 'quote')`
-- with two arguments and lets the default apply. This one passed `null`
-- explicitly, which overrode the default and hit
--
--   null value in column "period" of relation "number_sequences"
--
-- on the first invoice ever raised. Passing null to opt out of an argument is
-- not the same as omitting it, and here the difference was the whole bug.
--
-- Invoice numbers are deliberately NOT periodic: `INV-1, INV-2, ...` continues
-- across years. A gapless per-org sequence is what an accountant expects to
-- reconcile against, and restarting at 1 every January makes two invoices
-- share a number.
-- ============================================================================

create or replace function app.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null then
    new.number := app.next_number(new.org_id, 'invoice');
  end if;
  return new;
end;
$$;
