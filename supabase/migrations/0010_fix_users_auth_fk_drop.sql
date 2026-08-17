-- ============================================================
-- Fix: 0006 didn't actually drop the auth.users FK on production
--
-- 0006_drop_auth_users_dependency.sql ran:
--   alter table public.users drop constraint if exists users_id_fkey;
--
-- That name is what a fresh `create table users (id uuid primary key
-- references auth.users(id))` auto-generates -- which is what
-- happens when 0002_actual_schema.sql is applied to an empty
-- database, and is the only way this session's local Postgres tests
-- ever exercised 0006. But 0002's own header says this file
-- "documents already-existing production state" rather than being
-- what actually built it, and its own comments already flag that the
-- production users table carries a legacy name from an earlier
-- "profiles -> users" rename (the primary key is still physically
-- named profiles_pkey). The foreign key evidently carried the same
-- legacy naming -- profiles_id_fkey, not users_id_fkey -- so
-- `drop constraint if exists users_id_fkey` silently matched nothing
-- and no-op'd. The block on auth.users was never actually removed on
-- production, and every sign-up since has been hitting it
-- ("insert or update on table users violates foreign key constraint
-- profiles_id_fkey").
--
-- This migration doesn't guess a name at all -- it looks up whatever
-- foreign key actually links public.users to auth.users by its real
-- relationship in the catalog, and drops that, whatever it's called.
-- Safe to run whether or not 0006 already worked: if no such
-- constraint exists, this is a no-op.
-- ============================================================

do $$
declare
  fk_name text;
begin
  select con.conname
  into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_class frel on frel.oid = con.confrelid
  join pg_namespace fnsp on fnsp.oid = frel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'users'
    and con.contype = 'f'
    and fnsp.nspname = 'auth'
    and frel.relname = 'users';

  if fk_name is not null then
    execute format('alter table public.users drop constraint %I', fk_name);
  end if;
end $$;
