-- ============================================================
-- Transactional owner-signup RPC
--
-- signUpOwner (lib/actions.ts) previously did three separate writes
-- (insert users, insert dormitories, update users.dorm_id) with manual
-- rollback on each returned error. That's safe against errors but not
-- against a mid-sequence crash (timeout, connection drop) — which could
-- leave an orphaned auth.users + public.users row with no dormitory.
--
-- This wraps the three writes in one plpgsql function. Postgres runs a
-- function body in an implicit transaction, so any unhandled exception
-- rolls back every write it made — no more partial state possible for
-- the public.users/dormitories side. The auth.users row itself is still
-- created separately by supabase.auth.signUp() beforehand (Auth doesn't
-- share a transaction with our own tables), so the caller still needs to
-- delete that auth user if this RPC returns an error — same as before,
-- just one failure path instead of three.
--
-- Tested against a throwaway local Postgres 16 instance before landing
-- here: success path (creates both rows, correctly linked), atomicity
-- (forcing the second insert to fail leaves zero trace of the first),
-- and duplicate-signup (clean primary-key error, no orphaned dormitory).
-- ============================================================

create or replace function public.create_owner_account(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_dorm_name text
)
-- Named out_dorm_id/out_join_code (not dorm_id/join_code) — using the
-- bare column names here shadows dormitories.dorm_id/join_code inside
-- the function body and makes the RETURNING clause below ambiguous
-- (confirmed by actually running this against Postgres, which rejected
-- the original version with "column reference is ambiguous").
returns table (out_dorm_id uuid, out_join_code text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dorm_id uuid;
  v_join_code text;
begin
  insert into public.users (id, role, full_name, email)
  values (p_user_id, 'owner', p_full_name, p_email);

  insert into public.dormitories (name, owner_id)
  values (p_dorm_name, p_user_id)
  returning id, join_code into v_dorm_id, v_join_code;

  update public.users
  set dorm_id = v_dorm_id
  where id = p_user_id;

  return query select v_dorm_id, v_join_code;
end;
$$;