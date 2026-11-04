-- ============================================================
-- A third role: platform_admin
--
-- Until now an account was either an `owner` (runs ONE dormitory) or a `tenant`.
-- The platform admin is the person who runs DormVision itself, across every
-- dormitory: they can see and suspend dorms and accounts, help locked-out users,
-- and review the audit log -- but they are not an owner or a tenant and have no
-- dorm of their own (0028 enforces that).
--
-- This is deliberately its own migration. Postgres will not let a value added
-- with ALTER TYPE be USED in the same transaction that added it, and 0028 uses
-- it (in a constraint) straight away. Run this one first and let it finish.
--
-- Nobody can sign up as a platform admin: the public sign-up forms only ever
-- create owners and tenants. Create the account with `npm run create-admin`.
-- ============================================================

alter type public.user_role add value if not exists 'platform_admin';
