-- ============================================================
-- Per-user appearance preferences
--
-- Profile -> Appearance lets a user pick a color mode (light / dark /
-- system) and a color-scheme palette (see lib/palettes.ts). Both were
-- originally remembered only in the browser (localStorage); these columns
-- let the choice follow the account across devices.
--
-- Both are nullable on purpose: NULL means "never chosen", and the app
-- then keeps whatever the current device already uses. color_scheme is
-- deliberately not constrained to a fixed list, so adding a palette in
-- code never needs a migration -- unknown values are ignored by the app.
-- ============================================================

alter table public.users
  add column if not exists theme_mode text
    check (theme_mode in ('light', 'dark', 'system')),
  add column if not exists color_scheme text;
