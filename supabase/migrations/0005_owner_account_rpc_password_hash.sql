-- ============================================================
-- Add password_hash to create_owner_account
--
-- Now that signup hashes the owner's password with bcrypt instead of
-- handing it to Supabase Auth, the atomic users+dormitories insert RPC
-- needs to set it as part of the same transaction — bolting it on with
-- a separate UPDATE after the RPC call would reopen exactly the
-- partial-failure window 0003 was written to close (an owner account
-- that exists but can never log in because the follow-up UPDATE failed).
--
-- CREATE OR REPLACE can't change a function's parameter list in place —
-- Postgres treats a different signature as a different function — so
-- the old 4-parameter version is dropped first.
-- ============================================================

drop function if exists public.create_owner_account(uuid, text, text, text);

create or replace function public.create_owner_account(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_dorm_name text,
  p_password_hash text
)
returns table (out_dorm_id uuid, out_join_code text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dorm_id uuid;
  v_join_code text;
begin
  insert into public.users (id, role, full_name, email, password_hash)
  values (p_user_id, 'owner', p_full_name, p_email, p_password_hash);

  insert into public.dormitories (name, owner_id)
  values (p_dorm_name, p_user_id)
  returning id, join_code into v_dorm_id, v_join_code;

  update public.users
  set dorm_id = v_dorm_id
  where id = p_user_id;

  return query select v_dorm_id, v_join_code;
end;
$$;
