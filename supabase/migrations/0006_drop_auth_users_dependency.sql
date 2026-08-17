-- ============================================================
-- Drop the users -> auth.users foreign key
--
-- 0004's header comment described an intermediate plan where sign-up
-- would still call admin.auth.admin.createUser() purely to mint an
-- identity for public.users.id to point at. That plan was superseded
-- before it shipped: DormVision moved to the fully custom auth pattern
-- (lib/actions.ts signUpOwner/signUpTenant generate their own uuid via
-- crypto.randomUUID() and never touch Supabase Auth at all).
--
-- Without this migration every sign-up fails outright — confirmed by
-- actually running it: public.users.id still had `references
-- auth.users(id)` from 0002_actual_schema.sql, so inserting a
-- freshly-generated uuid that has no corresponding auth.users row trips
-- the foreign key ("violates foreign key constraint users_id_fkey").
--
-- Existing rows are untouched — this only removes the constraint, not
-- any data. 0004's one-time backfill (copying auth.users.encrypted_password
-- into password_hash for pre-migration accounts) already ran before this
-- and is unaffected; it only ever needed auth.users to exist, not to keep
-- being referenced afterward.
-- ============================================================

alter table public.users
  drop constraint if exists users_id_fkey;
