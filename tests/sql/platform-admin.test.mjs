import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const roleMigration = read("0027_platform_admin_role.sql");
const migration = read("0028_platform_admin.sql");

// The two tables 0028 alters, as they are before it runs. Supabase's default
// grants are in place so that RLS / revokes, not missing grants, are what's tested.
async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec("create type public.user_role as enum ('owner', 'tenant');");
  await db.exec(`
    create table public.dormitories (id uuid primary key default gen_random_uuid(), name text, created_at timestamptz not null default now());
    create table public.users (id uuid primary key default gen_random_uuid(), email text, role public.user_role not null, dorm_id uuid references public.dormitories(id));
  `);
  return db;
}

// 0027 must be its own transaction: a new enum value can't be used in the one
// that adds it. Running them as two separate calls mirrors the SQL Editor.
async function migrated(seed) {
  const db = await freshDb();
  if (seed) await db.exec(seed);
  await db.exec(roleMigration);
  await db.exec(migration);
  return db;
}

test("existing dorms are backfilled as approved, with the date they were created", async () => {
  const db = await migrated(`
    insert into public.dormitories (name, created_at) values ('Old Dorm', '2026-01-05T00:00:00Z');
  `);
  const { rows } = await db.query("select approved_at = created_at as same, suspended_at from public.dormitories");

  assert.equal(rows[0].same, true);
  assert.equal(rows[0].suspended_at, null);
});

test("a dorm created afterwards defaults to approved; the app can clear it to make it pending", async () => {
  const db = await migrated();
  await db.exec("insert into public.dormitories (name) values ('New')");
  assert.ok((await db.query("select approved_at from public.dormitories")).rows[0].approved_at);

  await db.exec("update public.dormitories set approved_at = null");
  assert.equal((await db.query("select approved_at from public.dormitories")).rows[0].approved_at, null);
});

test("running 0028 again does NOT approve a dorm that is pending", async () => {
  const db = await migrated();
  await db.exec("insert into public.dormitories (name, approved_at) values ('Pending', null)");

  await db.exec(migration);

  assert.equal((await db.query("select approved_at from public.dormitories")).rows[0].approved_at, null);
});

test("a platform admin can exist, but cannot belong to a dorm", async () => {
  const db = await migrated("insert into public.dormitories (name) values ('D');");
  const dorm = (await db.query("select id from public.dormitories")).rows[0].id;

  await db.query("insert into public.users (email, role) values ('root@t.com', 'platform_admin')");
  await assert.rejects(
    db.query("insert into public.users (email, role, dorm_id) values ('x@t.com', 'platform_admin', $1)", [dorm]),
    /users_platform_admin_has_no_dorm|check constraint/i
  );
  // owners and tenants are unaffected
  await db.query("insert into public.users (email, role, dorm_id) values ('o@t.com', 'owner', $1)", [dorm]);
});

test("platform_settings holds exactly one row, and approval is off by default", async () => {
  const db = await migrated();
  const { rows } = await db.query("select require_owner_approval from public.platform_settings");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].require_owner_approval, false);
  await assert.rejects(db.exec("insert into public.platform_settings (id) values (false)"), /check constraint|violates/i);
  await assert.rejects(db.exec("insert into public.platform_settings (id) values (true)"), /duplicate key|unique/i);
});

test("running the migrations twice leaves a single settings row", async () => {
  const db = await migrated();
  await db.exec(roleMigration);
  await db.exec(migration);

  assert.equal((await db.query("select count(*)::int c from public.platform_settings")).rows[0].c, 1);
});

const addEntry = (db) =>
  db.query(
    "insert into public.audit_log (actor_email, action, target_type, target_label) values ('root@t.com', 'dorm.suspend', 'dormitory', 'Old Dorm') returning id"
  );

test("the audit log accepts entries and keeps them in order", async () => {
  const db = await migrated();
  await addEntry(db);
  await db.query("insert into public.audit_log (actor_email, action, details) values ('root@t.com', 'settings.update', '{\"require_owner_approval\":true}')");

  const { rows } = await db.query("select action, details from public.audit_log order by created_at, action");
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.action === "settings.update").details.require_owner_approval, true);
});

test("audit entries can't be edited, deleted or truncated -- even by the superuser", async () => {
  const db = await migrated();
  await addEntry(db);

  await assert.rejects(db.exec("update public.audit_log set action = 'nothing happened'"), /append-only/);
  await assert.rejects(db.exec("delete from public.audit_log"), /append-only/);
  await assert.rejects(db.exec("truncate public.audit_log"), /append-only/);

  assert.equal((await db.query("select count(*)::int c from public.audit_log")).rows[0].c, 1);
});

test("service_role (the app's key) can add to the audit log but has no update/delete privilege", async () => {
  const db = await migrated();
  await addEntry(db);

  await db.exec("set role service_role");
  await db.exec("insert into public.audit_log (actor_email, action) values ('root@t.com', 'account.disable')");
  await assert.rejects(db.exec("update public.audit_log set action = 'x'"), /permission denied/i);
  await assert.rejects(db.exec("delete from public.audit_log"), /permission denied/i);
  await db.exec("reset role");

  assert.equal((await db.query("select count(*)::int c from public.audit_log")).rows[0].c, 2);
});

test("the public roles can't read or write the audit log or the settings (RLS)", async () => {
  const db = await migrated();
  await addEntry(db);

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    assert.equal((await db.query("select count(*)::int c from public.audit_log")).rows[0].c, 0, `${role} read the log`);
    assert.equal((await db.query("select count(*)::int c from public.platform_settings")).rows[0].c, 0, `${role} read settings`);
    await assert.rejects(
      db.exec("insert into public.audit_log (actor_email, action) values ('evil', 'forged')"),
      /row-level security|violates|permission denied/i,
      `${role} wrote to the log`
    );
    await db.exec("update public.platform_settings set require_owner_approval = true");
    await db.exec("reset role");
    assert.equal(
      (await db.query("select require_owner_approval r from public.platform_settings")).rows[0].r,
      false,
      `${role} changed the settings`
    );
  }
});
