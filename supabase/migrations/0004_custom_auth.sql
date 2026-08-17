-- ============================================================
-- Custom auth: password_hash + reset token columns
--
-- DormVision is moving login/session off Supabase Auth entirely onto a
-- self-issued JWT cookie (see lib/jwt.ts, lib/auth.ts), verified with
-- bcrypt against a password hash stored directly on public.users. This
-- was driven by repeated, hard-to-debug failures in Supabase's built-in
-- email-link flow for password reset (redirect allow-list fallbacks,
-- otp_expired errors on a working-as-designed 1-hour-expiry token).
--
-- auth.users is only read here, once, for the backfill below — existing
-- accounts already have a bcrypt hash sitting in
-- auth.users.encrypted_password from before this migration. Sign-up no
-- longer creates auth.users rows at all going forward (public.users.id
-- stops referencing auth.users entirely as of
-- 0006_drop_auth_users_dependency.sql); this migration only needs
-- auth.users to still exist for the one-time copy, not to keep pointing
-- at it afterward.
-- ============================================================

alter table public.users
  add column if not exists password_hash text,
  add column if not exists reset_token text,
  add column if not exists reset_token_expires timestamptz;

create unique index if not exists users_reset_token_idx
  on public.users (reset_token)
  where reset_token is not null;

-- One-time backfill: Supabase Auth (GoTrue) already stores every existing
-- user's password as a standard bcrypt hash in auth.users.encrypted_password.
-- bcrypt's hash format ($2a$/$2b$/$2y$...) is a portable, documented
-- standard, not Go/GoTrue-specific — bcryptjs can verify these hashes
-- directly. That means existing owners/tenants keep logging in with their
-- current password; nobody is forced to reset just because this ran.
update public.users u
set password_hash = a.encrypted_password
from auth.users a
where a.id = u.id
  and u.password_hash is null
  and a.encrypted_password is not null
  and a.encrypted_password <> '';

-- Left nullable rather than NOT NULL: safer for a migration touching
-- live data (an edge-case row failing the backfill shouldn't fail the
-- whole migration). Application code is responsible for always setting
-- it on insert going forward.
