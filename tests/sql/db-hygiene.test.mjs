import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

// A cut-down copy of the real schema: only the tables and columns these two
// migrations touch, with the kind of policies migration 0002 created.
async function schemaWithOldPolicies() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.users (id uuid primary key default gen_random_uuid(), email text);
    create table public.dormitories (id uuid primary key default gen_random_uuid(), owner_id uuid references public.users(id));
    create table public.rooms (id uuid primary key default gen_random_uuid());
    create table public.tenants (id uuid primary key default gen_random_uuid(), profile_id uuid references public.users(id), room_id uuid references public.rooms(id));
    create table public.bills (id uuid primary key default gen_random_uuid(), room_id uuid references public.rooms(id));
    create table public.maintenance_requests (id uuid primary key default gen_random_uuid(), room_id uuid references public.rooms(id));
    create table public.not_yet_protected (id uuid primary key default gen_random_uuid());

    alter table public.users enable row level security;
    alter table public.tenants enable row level security;
    alter table public.bills enable row level security;
    create policy "Users view their own row" on public.users for select using (id = auth.uid());
    create policy "Users update their own row" on public.users for update using (id = auth.uid());
    create policy "Tenants view their own record" on public.tenants for select using (profile_id = auth.uid());
    create policy "Tenants view their roommates" on public.tenants for select using (true);
    create policy "Tenants view their own bills" on public.bills for select using (true);

    insert into public.users (email) values ('a@t.com');
    insert into public.tenants (profile_id) select id from public.users;
    insert into public.bills (room_id) values (null);
  `);
  return db;
}

const indexNames = async (db) =>
  (await db.query("select indexname from pg_indexes where schemaname='public'")).rows.map((r) => r.indexname);

test("0025 creates the four indexes the app relies on", async () => {
  const db = await schemaWithOldPolicies();
  await db.exec(read("0025_missing_indexes.sql"));
  const names = await indexNames(db);

  for (const idx of [
    "tenants_profile_id_idx",
    "bills_room_id_idx",
    "maintenance_requests_room_id_idx",
    "dormitories_owner_id_idx",
  ]) {
    assert.ok(names.includes(idx), idx);
  }
});

test("0025 does not index the columns nothing filters on", async () => {
  const db = await schemaWithOldPolicies();
  await db.exec(read("0025_missing_indexes.sql"));

  assert.equal((await indexNames(db)).filter((n) => !n.endsWith("_pkey")).length, 4);
});

test("0025 is safe to run twice", async () => {
  const db = await schemaWithOldPolicies();
  await db.exec(read("0025_missing_indexes.sql"));
  await assert.doesNotReject(db.exec(read("0025_missing_indexes.sql")));
});

test("0026 removes every policy in public and nothing else", async () => {
  const db = await schemaWithOldPolicies();
  assert.equal((await db.query("select count(*)::int c from pg_policies where schemaname='public'")).rows[0].c, 5);

  await db.exec(read("0026_drop_unused_rls_policies.sql"));

  assert.equal((await db.query("select count(*)::int c from pg_policies where schemaname='public'")).rows[0].c, 0);
  // the tables and their data are untouched
  assert.equal((await db.query("select count(*)::int c from public.users")).rows[0].c, 1);
});

test("0026 keeps (and extends) row-level security: default-deny stays in force", async () => {
  const db = await schemaWithOldPolicies();
  await db.exec(read("0026_drop_unused_rls_policies.sql"));

  const { rows } = await db.query(`
    select c.relname, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r'`);
  for (const r of rows) assert.equal(r.rls, true, `${r.relname} has RLS on`);
});

test("after 0026 the public roles still see nothing, and the app's role still sees everything", async () => {
  const db = await schemaWithOldPolicies();
  await db.exec(read("0026_drop_unused_rls_policies.sql"));
  const count = async (role, table) => {
    await db.exec(`set role ${role}`);
    const n = (await db.query(`select count(*)::int c from public.${table}`)).rows[0].c;
    await db.exec("reset role");
    return n;
  };

  for (const role of ["anon", "authenticated"]) {
    assert.equal(await count(role, "users"), 0, `${role} sees users`);
    assert.equal(await count(role, "tenants"), 0, `${role} sees tenants`);
    assert.equal(await count(role, "not_yet_protected"), 0, `${role} sees the previously unprotected table`);
  }
  // service_role bypasses RLS in Supabase (BYPASSRLS); model that here.
  await db.exec("alter role service_role bypassrls");
  assert.equal(await count("service_role", "users"), 1);
  assert.equal(await count("service_role", "tenants"), 1);
});

test("0026 is safe to run twice", async () => {
  const db = await schemaWithOldPolicies();
  await db.exec(read("0026_drop_unused_rls_policies.sql"));
  await assert.doesNotReject(db.exec(read("0026_drop_unused_rls_policies.sql")));
});
