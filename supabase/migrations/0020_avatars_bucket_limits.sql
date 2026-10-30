-- ============================================================
-- Avatars bucket: size limit and allowed image types
--
-- The `avatars` bucket was created by hand in the Supabase dashboard
-- (no migration made it), as public with NO size limit and NO MIME
-- restriction, so anything of any size could be stored. This records
-- the bucket in the migrations and gives it limits.
--
-- The app now compresses avatars in the browser (about 512 px WebP,
-- typically well under 100 KB) and the upload route re-checks size and
-- real file type, so 1 MB is generous headroom, not a squeeze. GIF is
-- dropped: it was accepted before but nothing needs animated avatars.
--
-- This only constrains NEW uploads. Existing objects (a couple of
-- 1.28 MB PNGs) are left alone and keep working.
--
-- Stays public on purpose: avatars are shown across pages by URL.
-- New uploads get a unique, timestamped filename, so the URL changes
-- whenever the picture does and browser/CDN caches can never serve an
-- old image (the previous fixed `avatar.jpg` path could).
-- ============================================================

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  1048576,                     -- 1 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
