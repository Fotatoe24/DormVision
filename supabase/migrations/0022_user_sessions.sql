-- ============================================================
-- Server-side sessions
--
-- Until now a sign-in was only a signed cookie (lib/jwt.ts): valid for 7 days
-- no matter what happened afterwards. Logging out merely deleted the cookie
-- in the browser, so a copy of that cookie kept working, and changing or
-- resetting a password did nothing to sessions that already existed.
--
-- This table gives every sign-in an identity the server can end:
--   * the signed cookie carries a session id (`sid`);
--   * every request checks that the session still exists and hasn't expired
--     (lib/auth.ts -> getSessionUser);
--   * logout deletes the row; a password change deletes the user's OTHER
--     sessions; a password reset deletes ALL of them.
--
-- No SECURITY DEFINER functions here on purpose -- the app reads and writes
-- this table directly through the service-role client. RLS is on with no
-- policies, so the public (anon) key can read and write nothing.
--
-- ROLLOUT NOTE: cookies issued before this migration have no `sid`, so once
-- it is in effect everyone signs in again once. Until it is run, the app
-- keeps accepting the old cookies (and logs a warning).
-- ============================================================

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Matches the cookie's own 7-day expiry.
  expires_at timestamptz not null
);

-- "revoke everything for this user" and the periodic expired-row cleanup.
create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id);
create index if not exists user_sessions_expires_at_idx
  on public.user_sessions (expires_at);

alter table public.user_sessions enable row level security;
