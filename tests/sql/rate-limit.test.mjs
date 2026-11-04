import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../../supabase/migrations/0024_rate_limits.sql", import.meta.url),
  "utf8"
);

// Supabase gives the public roles access to new objects by default; RLS and the
// REVOKEs in the migration are what keep them out -- so reproduce those defaults.
async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec("alter default privileges in schema public grant execute on functions to anon, authenticated;");
  await db.exec(migration);
  return db;
}

const hit = async (db, key, max = 3, window = 60) =>
  (await db.query("select * from public.rate_limit_hit($1,$2,$3)", [key, max, window])).rows[0];

test("allows up to the limit, then blocks", async () => {
  const db = await freshDb();
  for (let i = 1; i <= 3; i++) assert.equal((await hit(db, "k")).allowed, true, `hit ${i}`);

  const blocked = await hit(db, "k");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retry_after_seconds > 0 && blocked.retry_after_seconds <= 60);
});

test("keys are independent", async () => {
  const db = await freshDb();
  for (let i = 0; i < 4; i++) await hit(db, "a");

  assert.equal((await hit(db, "a")).allowed, false);
  assert.equal((await hit(db, "b")).allowed, true);
});

test("a new window starts after the old one ends", async () => {
  const db = await freshDb();
  for (let i = 0; i < 4; i++) await hit(db, "k");
  assert.equal((await hit(db, "k")).allowed, false);

  await db.query("update public.rate_limits set window_started_at = now() - interval '2 minutes' where key = 'k'");
  assert.equal((await hit(db, "k")).allowed, true);
  assert.equal((await db.query("select hits from public.rate_limits where key='k'")).rows[0].hits, 1);
});

test("being blocked does not extend the window (no endless lockout)", async () => {
  const db = await freshDb();
  for (let i = 0; i < 4; i++) await hit(db, "k");
  const before = (await db.query("select window_started_at w from public.rate_limits where key='k'")).rows[0].w;

  for (let i = 0; i < 5; i++) await hit(db, "k");
  const after = (await db.query("select window_started_at w from public.rate_limits where key='k'")).rows[0].w;

  assert.equal(String(after), String(before));
});

test("20 simultaneous requests: no more than the limit get through", async () => {
  const db = await freshDb();
  const results = await Promise.all(Array.from({ length: 20 }, () => hit(db, "burst", 5, 60)));

  assert.ok(results.filter((r) => r.allowed).length <= 5);
});

test("overlong keys are truncated, not rejected", async () => {
  const db = await freshDb();
  assert.equal((await hit(db, "x".repeat(500))).allowed, true);
  assert.equal((await db.query("select length(key) l from public.rate_limits")).rows[0].l, 200);
});

test("the public roles can't call it or read the table (even with default grants)", async () => {
  const db = await freshDb();
  await hit(db, "victim");

  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      db.exec(`set role ${role}; select * from public.rate_limit_hit('x',1,1);`),
      /permission denied/i,
      role
    );
    await db.exec("reset role");

    await db.exec(`set role ${role}`);
    const seen = (await db.query("select count(*)::int c from public.rate_limits")).rows[0].c;
    await db.exec("reset role");
    assert.equal(seen, 0, `${role} saw rows`); // RLS blocks it
  }
});

test("the app's own role (service_role) can use it", async () => {
  const db = await freshDb();
  await db.exec("set role service_role");
  const { rows } = await db.query("select * from public.rate_limit_hit('ok',3,60)");
  await db.exec("reset role");

  assert.equal(rows[0].allowed, true);
});

test("running the migration twice is harmless", async () => {
  const db = await freshDb();
  await assert.doesNotReject(db.exec(migration));
});
