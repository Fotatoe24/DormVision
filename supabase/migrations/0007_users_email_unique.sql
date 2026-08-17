-- ============================================================
-- Enforce unique email at the database level
--
-- Under Supabase Auth, public.users.email never needed its own
-- uniqueness constraint — auth.users.email was already unique, and
-- public.users.id was 1:1 with it, so duplicate emails were impossible
-- by construction. 0006_drop_auth_users_dependency.sql removed that
-- link entirely, and lib/actions.ts now only guards against duplicate
-- emails with an application-level SELECT-then-INSERT in
-- signUpOwner/signUpTenant — which is a real TOCTOU race: two
-- concurrent sign-ups with the same email can both pass the existence
-- check and both insert.
--
-- Case-insensitive (on lower(email)) to match the .toLowerCase()
-- normalization already applied to every email in lib/actions.ts
-- (login, signUpOwner, signUpTenant, requestPasswordReset).
--
-- NOTE: if production already has two rows sharing an email (case-
-- insensitively), this migration will fail on that duplicate — check
-- with `select lower(email), count(*) from public.users group by 1
-- having count(*) > 1` before applying, and resolve any hits first.
-- ============================================================

create unique index if not exists users_email_unique_idx
  on public.users (lower(email));
