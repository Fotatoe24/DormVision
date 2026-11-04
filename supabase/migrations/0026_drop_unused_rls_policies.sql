-- ============================================================
-- OPTIONAL: remove the row-level-security policies nothing can use
--
-- Read this before running it. It is not required for the app to work.
--
-- The policies in migrations 0002, 0009, 0012, 0013 and friends were written for
-- Supabase Auth: they decide access from auth.uid(). This app does not use
-- Supabase Auth -- sign-in is our own cookie (lib/jwt.ts) -- so
--
--   * no request ever carries an auth.uid(), and
--   * the app reaches the database only through the service-role client, which
--     bypasses RLS entirely.
--
-- So these policies never allow anything. Leaving them has costs:
--   * Supabase's performance report flags 91 warnings about them
--     (auth_rls_initplan, multiple_permissive_policies);
--   * they give the false impression that RLS is what protects the data;
--   * since 0023 revoked is_owner()/user_dorm_id()/user_room_id() from the public
--     roles, a request that reaches them fails with "permission denied" rather
--     than cleanly returning nothing.
--
-- What protects the data is, in fact: RLS enabled on every table with NO
-- permissive policy, i.e. the public (anon) and signed-in roles see nothing.
-- This migration removes only the policies; every table keeps RLS enabled, so
-- the default-deny stays exactly as strong as it is now.
--
-- DO NOT run it if you plan to move to Supabase Auth (or otherwise let the
-- browser talk to the database directly) -- you'd need those policies, or new
-- ones. They are all still defined in the earlier migrations, so this is
-- reversible by re-creating them.
--
-- Scope: schema `public` only. Storage policies are untouched. Each dropped
-- policy is reported in the migration output so there is a record of it.
-- ============================================================

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'dropped policy "%" on %.%', p.policyname, p.schemaname, p.tablename;
  end loop;
end $$;

-- Make sure the default-deny really is in force on every table in `public`
-- (a no-op for tables that already have RLS enabled).
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'enabled row level security on public.%', t.relname;
  end loop;
end $$;
