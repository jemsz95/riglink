-- Case-insensitive text for email and slug columns, so uniqueness and lookups
-- do not depend on the casing a user happened to type.
create extension if not exists citext with schema extensions;
