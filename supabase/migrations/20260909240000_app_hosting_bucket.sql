-- ============================================================================
-- The `app` bucket: the built SPA's origin.
--
-- Public read, because that is what a web app is. Everything sensitive in this
-- product is behind PostgREST and RLS, not behind the bundle -- the bundle
-- contains only the publishable anon key, which is designed to be public and
-- is useless without a session. Nothing in `dist/` is a secret; if it ever
-- is, that is the bug, not the bucket.
--
-- NO INSERT, UPDATE OR DELETE POLICY. Deployment is not a user action, so no
-- signed-in user gets to overwrite the application everyone else is running --
-- which is what a policy here would grant. Writes come from
-- `scripts/deploy-static.mjs` with the service-role key, held by CI and never
-- by the browser. That is the same posture as the `exports` bucket.
--
-- `allowed_mime_types` is deliberately left null. Restricting it would suggest
-- the list is a safety control, and it is not: every file here is JavaScript
-- and CSS that the browser is meant to execute. The control that matters is
-- who can write, and that is "nobody, without the service key".
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app', 'app', true, 10485760, null)
on conflict (id) do update
  set public          = excluded.public,
      file_size_limit = excluded.file_size_limit;
