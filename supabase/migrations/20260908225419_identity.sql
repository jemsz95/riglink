-- ============================================================================
-- Identity and tenancy.
--
-- One auth.users row per human. "Staff" and "client contact" are MEMBERSHIP
-- ROWS, not user types -- so one person can be staff of org A and a portal
-- contact of a client in org B with a single login, and access resolves per
-- row. There is deliberately no global user_type / is_staff column.
--
-- NOTE ON `FORCE ROW LEVEL SECURITY`: deliberately NOT used anywhere in this
-- schema. Portal writes go through SECURITY DEFINER RPCs that rely on
-- bypassing RLS and re-implementing authorization explicitly; FORCE would
-- apply RLS to the table owner and break them. RLS-enabled-with-no-policies is
-- the deny-by-default posture instead.
-- ============================================================================

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------

create table organizations (
  id                 uuid primary key default gen_random_uuid(),
  slug               citext not null unique,
  name               text not null,
  logo_path          text,
  brand_color        text,
  timezone           text not null default 'America/Chicago',
  currency           char(3) not null default 'USD',
  default_tax_rate   numeric(6, 4) not null default 0
                       check (default_tax_rate >= 0 and default_tax_rate < 1),
  invoice_prefix     text not null default 'INV-',
  invoice_terms_days smallint not null default 30 check (invoice_terms_days >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),

  -- The org slug is a top-level URL segment (/$orgSlug/...). TanStack Router
  -- ranks static segments above dynamic ones so real routes still win, but a
  -- reserved slug would make an org permanently unreachable -- reject it at
  -- write time rather than debugging it later.
  constraint organizations_slug_format
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  constraint organizations_slug_not_reserved
    check (
      slug not in (
        'login', 'logout', 'portal', 'callback', 'auth', 'join', 'invite',
        'api', 'admin', 'settings', 'app', 'health', 'onboarding', 'static',
        'assets', 'public', 'www', 'help', 'support', 'status', 'billing'
      )
    )
);
alter table organizations enable row level security;

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------

create type staff_role as enum ('owner', 'admin', 'dispatcher', 'tech');

comment on type staff_role is
  'owner: all of admin plus org deletion and owner management. '
  'admin: all operations incl. invoicing and member management. '
  'dispatcher: jobs/visits/scheduling/quotes, no invoicing or members. '
  'tech: assigned jobs plus evidence; no money visibility at all.';

create table org_members (
  org_id      uuid not null references organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        staff_role not null default 'tech',
  invited_by  uuid references auth.users (id),
  invited_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table org_members enable row level security;

-- Read by the access-token hook on every token mint, so it must be indexed.
create index org_members_user_id_idx on org_members (user_id);

create trigger org_members_set_updated_at
  before update on org_members
  for each row execute function app.set_updated_at();
