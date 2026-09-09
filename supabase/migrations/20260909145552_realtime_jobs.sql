-- ============================================================================
-- Realtime: publish job changes.
--
-- Without this, `postgres_changes` subscriptions on `jobs` are accepted by the
-- server and then deliver NOTHING -- the publication is empty by default, so
-- the client sees a healthy SUBSCRIBED channel and no events ever arrive. That
-- is the worst kind of failure: a dashboard that looks live and is stale.
--
-- Realtime evaluates the subscriber's RLS policies per change using their
-- access token, so this does not widen visibility: staff see their orgs, and a
-- portal contact sees only their client's non-draft jobs, exactly as with a
-- direct select.
-- ============================================================================

alter publication supabase_realtime add table public.jobs;

-- The audit trail is published too, so an open job detail page updates its
-- timeline when someone else moves the job.
alter publication supabase_realtime add table public.job_status_events;

-- REPLICA IDENTITY stays DEFAULT (primary key only).
--
-- FULL would put every column of the OLD row into the WAL, including
-- `internal_notes`, and Realtime sends `old_record` to subscribers on UPDATE
-- and DELETE. Staff-only columns must not leave the server through a channel a
-- portal contact is listening on. The `new_record` is filtered by RLS, but the
-- cost of getting this wrong is a confidentiality bug, so the narrow default
-- is the right trade: the client refetches through PostgREST anyway.
