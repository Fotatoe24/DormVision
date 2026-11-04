-- ============================================================
-- Close the public API door on the database functions
--
-- Supabase publishes every function in `public` at /rest/v1/rpc/<name>, and
-- by default lets PUBLIC, anon and authenticated execute them. The anon key
-- is not a secret (it ships to every browser as NEXT_PUBLIC_SUPABASE_ANON_KEY),
-- so for these seven SECURITY DEFINER functions that meant anyone on the
-- internet could call them directly, bypassing the app:
--
--   create_owner_account        -> create owner accounts + dormitories at will
--                                  (spam, or squatting someone's email)
--   lookup_dormitory_by_code    -> guess Dorm IDs with no rate limit
--   get_or_create_invoice_number / get_or_create_receipt_number
--                               -> burn document numbers
--   is_owner / user_dorm_id / user_room_id
--                               -> RLS helpers; harmless, but not meant to be
--                                  a public API either
--
-- Nothing legitimate calls them that way: the app runs every query through
-- the service-role client (lib/supabase/admin.ts) -- every .rpc() call in the
-- code goes through it, and the browser Supabase client is not used anywhere.
-- So taking EXECUTE away from the public roles changes nothing for users.
--
-- Same posture the login_attempt_* functions (0021) were created with: only
-- the server may call them.
--
-- Side effect worth knowing: the old RLS policies still reference is_owner()
-- and user_dorm_id(). A request made with the public key now fails with
-- "permission denied" instead of an empty result. Either way it gets no data,
-- and the app never makes such requests.
-- ============================================================

-- ---------- 1. Server-only ----------

revoke all on function public.create_owner_account(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_or_create_invoice_number(uuid)
  from public, anon, authenticated;
revoke all on function public.get_or_create_receipt_number(uuid)
  from public, anon, authenticated;
revoke all on function public.lookup_dormitory_by_code(text)
  from public, anon, authenticated;
revoke all on function public.is_owner()
  from public, anon, authenticated;
revoke all on function public.user_dorm_id()
  from public, anon, authenticated;
revoke all on function public.user_room_id()
  from public, anon, authenticated;

-- service_role (the app) keeps -- and is explicitly given -- access.
grant execute on function public.create_owner_account(uuid, text, text, text, text) to service_role;
grant execute on function public.get_or_create_invoice_number(uuid) to service_role;
grant execute on function public.get_or_create_receipt_number(uuid) to service_role;
grant execute on function public.lookup_dormitory_by_code(text) to service_role;
grant execute on function public.is_owner() to service_role;
grant execute on function public.user_dorm_id() to service_role;
grant execute on function public.user_room_id() to service_role;

-- ---------- 2. Pin the search_path ----------
-- The only SECURITY DEFINER function without one (the rest were created with
-- `set search_path = public`). An unpinned path lets a caller's own schema
-- shadow the tables a definer-privileged function reads.
alter function public.lookup_dormitory_by_code(text) set search_path = public;
