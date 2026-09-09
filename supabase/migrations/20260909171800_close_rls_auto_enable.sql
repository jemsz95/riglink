-- ============================================================================
-- Close public.rls_auto_enable() to `authenticated`.
--
-- The previous two migrations revoked function EXECUTE from `public` and
-- `anon`, which closed this function to unauthenticated callers, but left the
-- explicit `authenticated=X` grant that shipped with it. The security advisor
-- still reports it, correctly:
--
--   public.rls_auto_enable() can be executed by the `authenticated` role as a
--   SECURITY DEFINER function via /rest/v1/rpc/rls_auto_enable
--
-- It is Supabase's event-trigger function for auto-enabling RLS on new
-- tables, and it is owned by `postgres`, so it is ours to lock. Calling it
-- over the API cannot do damage today -- it returns `event_trigger`, a
-- pseudo-type PostgREST cannot serialise (`0A000`) -- but a definer function
-- reachable by any signed-in user is not something to leave sitting there on
-- the strength of an error code.
--
-- Event triggers do not consult EXECUTE privileges, so `ensure_rls` keeps
-- working. Verified after the revoke: a new table still arrives with
-- relrowsecurity = true.
--
-- Rather than naming one function, this resets EXECUTE for `authenticated`
-- across the schema and re-grants the RPCs the app calls. Anything not on
-- this list is not callable, which is the property worth having -- the list
-- is the API surface, written down in one place.
-- ============================================================================

revoke execute on all functions in schema public from authenticated;

-- Session and org bootstrap.
grant execute on function public.bootstrap_session() to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.my_memberships() to authenticated;

-- Portal writes. Definer, each with its own contact check inside.
grant execute on function public.submit_job_request(uuid, text, text, uuid, date) to authenticated;
grant execute on function public.approve_quote(uuid, text) to authenticated;
grant execute on function public.decline_quote(uuid, text) to authenticated;

-- Staff write. SECURITY INVOKER: it runs on the caller's own grants and
-- policies, which is why it needs no guard of its own.
grant execute on function public.send_quote(uuid) to authenticated;

-- Deliberately not granted: public.rls_auto_enable().
