-- ============================================================================
-- Field evidence: photos, documents and notes attached to a job.
--
-- Phase 4. The surface a technician actually uses, on a phone, on a roof, on
-- one bar of signal. Three things drive every decision below.
--
-- 1. UPLOADS ARE RETRIED, SO COMMITS MUST BE IDEMPOTENT.
--
--    The client compresses, queues to IndexedDB, uploads resumably (tus), then
--    inserts a row. Any of those steps can be interrupted and resumed minutes
--    or hours later, on a different network, possibly after the app was
--    killed. The dangerous case is not a failed commit -- it is a commit that
--    SUCCEEDED and whose response was lost, because the retry then duplicates
--    the photo. So the client mints `client_ref` before the first attempt and
--    `unique (org_id, client_ref)` makes the insert idempotent: a replayed
--    commit conflicts instead of duplicating, and the client treats that
--    conflict as success. This is the single most important column here.
--
-- 2. EVIDENCE IS INTERNAL UNTIL SOMEONE SAYS OTHERWISE.
--
--    `client_visible` defaults to false. A tech photographing a corroded part
--    for the office is the common case; showing the client is a decision. The
--    default that leaks is the wrong default.
--
-- 3. TWO CLOCKS, BOTH RECORDED.
--
--    `captured_at` comes from the device and can be wrong -- a phone that has
--    been offline, a wrong timezone, a user changing the clock. `created_at`
--    is the server's. Keeping both means the timeline can show what the tech
--    saw while the record still says when it actually arrived. Collapsing them
--    into one would lose whichever question you later need to answer.
-- ============================================================================

create type public.evidence_kind as enum ('photo', 'document', 'note');

create table public.job_evidence (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  job_id         uuid not null,
  -- Denormalised so the portal policy needs no join, and provably consistent
  -- with the job through the composite FK below.
  client_id      uuid not null,
  kind           public.evidence_kind not null,

  -- Storage
  storage_path   text,
  mime_type      text,
  byte_size      bigint,
  width          integer,
  height         integer,

  -- Content
  caption        text,
  body           text,

  client_visible boolean not null default false,

  captured_at    timestamptz,
  captured_by    uuid references public.profiles (id) on delete set null,

  -- Minted by the client before the first upload attempt. See (1) above.
  client_ref     uuid not null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint job_evidence_job_org_fk
    foreign key (job_id, org_id) references public.jobs (id, org_id) on delete cascade,
  constraint job_evidence_job_client_fk
    foreign key (job_id, client_id) references public.jobs (id, client_id) on delete cascade,

  -- The retry key.
  constraint job_evidence_client_ref_key unique (org_id, client_ref),

  -- A note carries text and no file; a photo or document carries a file and no
  -- text. Modelling both in one table keeps the field log a single ordered
  -- query, which is what a log is; this constraint stops it becoming a bag of
  -- optional columns.
  constraint job_evidence_shape check (
    case kind
      when 'note' then
        storage_path is null
        and body is not null and length(btrim(body)) > 0
      else
        storage_path is not null and length(btrim(storage_path)) > 0
        and body is null
    end
  ),

  constraint job_evidence_byte_size_sane check (byte_size is null or byte_size > 0)
);

-- The gallery and the field log both read one job in captured order. Two
-- clocks, so order by the device's and fall back to the server's.
create index job_evidence_job_idx
  on public.job_evidence (job_id, coalesce(captured_at, created_at) desc, id);

-- The portal reads one client's visible evidence.
create index job_evidence_client_visible_idx
  on public.job_evidence (client_id, client_visible, created_at desc)
  where client_visible;

create index job_evidence_org_idx on public.job_evidence (org_id, created_at desc);
create index job_evidence_captured_by_idx on public.job_evidence (captured_by);

create trigger job_evidence_updated_at before update on public.job_evidence
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
--
-- Techs are the primary authors here, which is the opposite of the quote
-- surface: every staff role reads and writes evidence, so these use
-- app.staff_orgs(). Deletion is the exception -- see below.
-- ----------------------------------------------------------------------------

alter table public.job_evidence enable row level security;

create policy job_evidence_staff_select on public.job_evidence
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

-- The client sees only what was marked visible, and only on a job that is not
-- a staff draft. `client_visible` is the row filter; the portal view is the
-- column projection. Two locks, as everywhere else on this surface.
create policy job_evidence_portal_select on public.job_evidence
  for select to authenticated
  using (
    client_visible
    and client_id = any ((select app.portal_clients())::uuid[])
    and exists (
      select 1 from public.jobs j
      where j.id = job_evidence.job_id
        and j.status <> 'draft'
    )
  );

-- Any staff member of the org may add evidence, including a tech. `captured_by`
-- is checked against the caller so a row cannot be attributed to a colleague.
create policy job_evidence_staff_insert on public.job_evidence
  for insert to authenticated
  with check (
    org_id = any ((select app.staff_orgs())::uuid[])
    and (captured_by is null or captured_by = (select auth.uid()))
  );

-- A tech may edit their own evidence: fix a caption, correct a note, retract
-- a photo from the client's view. Dispatch roles may edit anything in the org,
-- because deciding what the client sees is their job.
create policy job_evidence_author_update on public.job_evidence
  for update to authenticated
  using (
    org_id = any ((select app.staff_orgs())::uuid[])
    and captured_by = (select auth.uid())
  )
  with check (
    org_id = any ((select app.staff_orgs())::uuid[])
    and captured_by = (select auth.uid())
  );

create policy job_evidence_dispatch_update on public.job_evidence
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- Deletion is NOT open to techs. Evidence is the record of what was found and
-- what was done; a photo that can vanish is worth less as evidence. Owners and
-- admins can remove a genuine mistake, and that is the whole delete surface.
create policy job_evidence_admin_delete on public.job_evidence
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

grant select, insert, update, delete on public.job_evidence to authenticated;

-- ----------------------------------------------------------------------------
-- Portal projection.
--
-- `captured_by` is absent: a client has no business with which employee took
-- the photo. `client_visible` is absent because every row here is visible by
-- definition -- exposing the flag would only invite a client to wonder what
-- else exists.
-- ----------------------------------------------------------------------------

create view public.portal_job_evidence_v with (security_invoker = on) as
select
  e.id,
  e.job_id,
  e.client_id,
  e.kind,
  e.storage_path,
  e.mime_type,
  e.width,
  e.height,
  e.caption,
  e.body,
  e.captured_at,
  e.created_at
from public.job_evidence e;

comment on view public.portal_job_evidence_v is
  'Client-visible evidence for one job. security_invoker = on: rows come from '
  'job_evidence_portal_select, which requires client_visible and a non-draft '
  'job.';

grant select on public.portal_job_evidence_v to authenticated;

-- ----------------------------------------------------------------------------
-- Buckets.
--
-- config.toml declares these for `supabase start`, but `config push` does not
-- create buckets on a hosted project -- verified: storage.buckets was empty
-- after every config push so far. So they are created here, which is also
-- what the config comment always said would happen.
--
-- `evidence` is PRIVATE and must stay private: it holds job photos, receipts
-- and internal notes, some deliberately hidden from the client. `public = true`
-- on this bucket would make every object world-readable by URL, with RLS
-- bypassed entirely.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence', 'evidence', false, 26214400,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('branding', 'branding', true, 2097152,
   array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']),
  ('exports', 'exports', false, 26214400, null)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Storage object policies.
--
-- Path convention, enforced by these policies rather than merely hoped for:
--
--   evidence/<org_id>/<job_id>/<client_ref>.<ext>
--
-- `storage.foldername(name)` splits the object name; [1] is the org and [2]
-- the job. A tech uploading under another org's prefix is refused by the
-- INSERT policy, so the path is not just a convention -- it is the tenant
-- boundary for the object store.
-- ----------------------------------------------------------------------------

create policy evidence_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1])::uuid = any ((select app.staff_orgs())::uuid[])
  );

create policy evidence_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1])::uuid = any ((select app.staff_orgs())::uuid[])
  );

-- Resumable (tus) uploads PATCH the same object repeatedly, and the final
-- chunk completes it, so an upload needs UPDATE as well as INSERT.
create policy evidence_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1])::uuid = any ((select app.staff_orgs())::uuid[])
  )
  with check (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1])::uuid = any ((select app.staff_orgs())::uuid[])
  );

create policy evidence_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1])::uuid
        = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
  );

-- The client's read path. A signed URL still requires SELECT on the object, so
-- this policy -- not the URL -- is what decides. Toggling `client_visible` off
-- therefore stops new signed URLs from working immediately.
--
-- CAVEAT, deliberately not hidden: a signed URL already in a client's hands is
-- a bearer token and stays valid until it expires, whatever this policy later
-- says. That is why the app signs evidence URLs with a short TTL rather than
-- an hour.
create policy evidence_portal_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and exists (
      select 1
      from public.job_evidence e
      where e.storage_path = storage.objects.name
        and e.client_visible
        and e.client_id = any ((select app.portal_clients())::uuid[])
    )
  );

-- Branding is a public bucket, so reads need no policy. Writes are the org's
-- own admins.
create policy branding_admin_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'branding'
    and ((storage.foldername(name))[1])::uuid
        = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
  )
  with check (
    bucket_id = 'branding'
    and ((storage.foldername(name))[1])::uuid
        = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
  );

-- `exports` is written by service-role code only (the accounting export runs
-- server-side), so there is no INSERT policy at all -- deliberately, like
-- number_sequences. Staff may read their own org's exports.
create policy exports_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and ((storage.foldername(name))[1])::uuid = any ((select app.staff_orgs())::uuid[])
  );

-- ----------------------------------------------------------------------------
-- Realtime: a dispatcher watching a job sees photos land as the tech takes
-- them. REPLICA IDENTITY stays DEFAULT so `old_record` carries only the key --
-- an internal note must not travel to a client's socket in an update payload.
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.job_evidence;
