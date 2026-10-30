-- ============================================================
-- Payment proofs
--
-- A tenant can attach a photo/screenshot of their payment receipt when
-- they report a payment; the owner reviews it next to the existing
-- Confirm / Reject buttons.
--
-- Review state is NOT duplicated here: payments.status (pending /
-- confirmed / rejected) with reviewed_by / reviewed_at (migration 0011)
-- already is the review workflow. This migration only adds what was
-- missing -- where the proof lives, and why a report was rejected.
--
-- ACCESS CONTROL, in one place: this app does not use Supabase Auth
-- (login is our own JWT, see lib/jwt.ts), so no request ever carries an
-- auth.uid() that a storage policy could key on, and the app reaches
-- storage through the service-role client, which bypasses RLS. So there
-- are deliberately NO permissive policies on storage.objects for this
-- bucket: with RLS on and no policy, the anon and authenticated roles
-- can read and write nothing. Every upload, and every signed URL, is
-- issued by server code that has already checked who is asking
-- (app/api/payments/report/route.ts, app/admin/payments/page.tsx,
-- app/tenant/billing/page.tsx).
-- ============================================================

-- ---------- 1. Private bucket ----------

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'payment-proofs',
  'payment-proofs',
  false,                       -- never served from a public URL
  2097152,                     -- 2 MB; the client compresses to ~0.4 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object path convention (built in lib/payment-proofs.ts):
--   {tenants.id}/{payments.id}-{unix-ms}.{webp|jpg|png}
-- A resubmission is a NEW payment row and therefore a new file; an
-- existing proof is never overwritten.

-- ---------- 2. Payments columns ----------

alter table public.payments
  -- The object path inside the bucket, never a URL: signed URLs are
  -- minted per view and expire, so there is nothing durable to store.
  add column if not exists proof_path text,
  -- Optional reason the owner gives when rejecting a report; shown to
  -- the tenant and included in the rejection email.
  add column if not exists review_note text;
