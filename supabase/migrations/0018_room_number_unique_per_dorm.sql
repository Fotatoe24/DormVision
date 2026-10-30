-- ============================================================
-- Room numbers are unique per dormitory, not globally
--
-- 0002 declared rooms.room_number as `unique` on its own, which makes
-- "Room 101" a single slot across EVERY dormitory in the database: the
-- second dorm that uses DormVision could never create a Room 101 (the
-- insert in createRoom fails with a raw duplicate-key error).
--
-- Room numbers only need to be unique within one dorm, so replace the
-- single-column constraint with a (dorm_id, room_number) one. Existing
-- data is safe: if room_number was globally unique it is certainly
-- unique per dorm.
--
-- Written to find the old constraint by its columns instead of
-- assuming its auto-generated name (rooms_room_number_key), and
-- guarded so re-running it is harmless.
-- ============================================================

do $$
declare
  old_constraint text;
begin
  for old_constraint in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.rooms'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from pg_attribute att
        where att.attrelid = con.conrelid
          and att.attnum = any (con.conkey)
      ) = array['room_number']
  loop
    execute format('alter table public.rooms drop constraint %I', old_constraint);
  end loop;
end $$;

create unique index if not exists rooms_dorm_id_room_number_key
  on public.rooms (dorm_id, room_number);
