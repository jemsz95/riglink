-- ============================================================================
-- Clients (customer companies), their portal contacts, and their sites.
--
-- Every tenant-scoped table carries org_id even where it is derivable, because
-- that is what keeps each RLS predicate to a single indexed column instead of a
-- join chain. Drift is prevented structurally: parents expose `unique (id,
-- org_id)` and children reference the PAIR, so a row physically cannot be
-- attached to a parent in a different org.
-- ============================================================================

create table clients (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  name            text not null,
  billing_email   citext,
  phone           text,
  billing_address jsonb,
  -- Internal only. Never exposed through a portal_* view.
  notes           text,
  -- Accounting system customer id, for the CSV export mapping.
  external_ref    text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  constraint clients_id_org_key unique (id, org_id)
);
alter table clients enable row level security;

create index clients_org_active_idx on clients (org_id) where archived_at is null;

create trigger clients_set_updated_at
  before update on clients
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------

create type contact_role as enum ('primary', 'standard', 'viewer');

comment on type contact_role is
  'primary/standard may approve quotes and sign off work; viewer is read-only.';

create table client_contacts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  client_id   uuid not null,
  -- NULL until the invited human first logs in. This is what lets a contact
  -- exist as an invited record (email + name) before any auth.users row does.
  user_id     uuid references auth.users (id) on delete set null,
  email       citext not null,
  full_name   text,
  phone       text,
  role        contact_role not null default 'standard',
  invited_by  uuid references auth.users (id),
  invited_at  timestamptz,
  accepted_at timestamptz,
  -- Revoked rather than deleted: the audit trail must retain who approved a
  -- large quote even after they are offboarded.
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint client_contacts_client_fk
    foreign key (client_id, org_id) references clients (id, org_id) on delete cascade,
  constraint client_contacts_client_email_key unique (client_id, email)
);
alter table client_contacts enable row level security;

-- Read by the access-token hook on every mint.
create index client_contacts_user_active_idx on client_contacts (user_id)
  where user_id is not null and revoked_at is null;
-- Used by the invite-claim path, which matches on verified email.
create index client_contacts_pending_email_idx on client_contacts (email)
  where user_id is null and revoked_at is null;
create index client_contacts_org_client_idx on client_contacts (org_id, client_id);

create trigger client_contacts_set_updated_at
  before update on client_contacts
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------

create table sites (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations (id) on delete cascade,
  client_id          uuid not null,
  name               text not null,
  address            jsonb,
  lat                numeric(9, 6),
  lng                numeric(9, 6),
  -- Per-SITE timezone, not just per-org: a job at a site in another zone would
  -- otherwise render at the wrong local time. One column now versus a data
  -- backfill later.
  timezone           text,
  -- Gate codes and similar. Staff-only; excluded from portal_site_v.
  access_notes       text,
  site_contact_name  text,
  site_contact_phone text,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  constraint sites_id_org_key unique (id, org_id),
  constraint sites_client_fk
    foreign key (client_id, org_id) references clients (id, org_id) on delete cascade
);
alter table sites enable row level security;

create index sites_org_client_idx on sites (org_id, client_id);

create trigger sites_set_updated_at
  before update on sites
  for each row execute function app.set_updated_at();
