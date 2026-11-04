-- ============================================================
-- Indexes for foreign keys the app actually filters on
--
-- Supabase's performance report lists nine foreign keys with no covering
-- index. Checked against how the app queries (every .eq()/.in() in app/, lib/,
-- components/), only these four are ever used to look rows up:
--
--   tenants.profile_id            filtered in 18 places -- nearly every tenant
--                                 request resolves "which tenant is this
--                                 account?" by it
--   bills.room_id                 billing pages, deleting a room
--   maintenance_requests.room_id  maintenance pages, deleting a room
--   dormitories.owner_id          the owner's dorm lookup
--
-- Deliberately NOT indexed (the report flags them, but nothing filters on them,
-- so an index would only add cost to every write): payments.recorded_by,
-- payments.reviewed_by, transactions.recorded_by, transactions.related_bill_id,
-- tenant_registration_requests.reviewed_by.
--
-- The tables are tiny today, so this is not a fix for a slow app -- it keeps the
-- lookups that run on every request cheap as the data grows.
-- ============================================================

create index if not exists tenants_profile_id_idx
  on public.tenants (profile_id);

create index if not exists bills_room_id_idx
  on public.bills (room_id);

create index if not exists maintenance_requests_room_id_idx
  on public.maintenance_requests (room_id);

create index if not exists dormitories_owner_id_idx
  on public.dormitories (owner_id);
