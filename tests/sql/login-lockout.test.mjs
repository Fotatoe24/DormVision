import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../../supabase/migrations/0021_login_lockout.sql", import.meta.url),
  "utf8"
);

async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec("alter default privileges in schema public grant execute on functions to anon, authenticated;");
  await db.exec(migration);
  return db;
}

const begin = async (db, e) => (await db.query("select * from public.login_attempt_begin($1)", [e])).rows[0];
const failed = async (db, e) => (await db.query("select * from public.login_attempt_failed($1)", [e])).rows[0];
const clear = (db, e) => db.query("select public.login_attempt_clear($1)", [e]);
const row = async (db, e) => (await db.query("select * from public.login_attempts where email=$1", [e])).rows[0];

// One wrong password = begin() then failed(), exactly as login() does.
async function wrongTry(db, e) {
  const b = await begin(db, e);
  if (b.locked) return { blocked: true, ...b };
  return { blocked: false, ...(await failed(db, e)) };
}

const A = "a@test.com";

test("the first two wrong tries are allowed and count down", async () => {
  const db = await freshDb();

  let r = await wrongTry(db, A);
  assert.deepEqual([r.blocked, r.locked, r.attempts_left], [false, false, 2]);
  r = await wrongTry(db, A);
  assert.deepEqual([r.blocked, r.locked, r.attempts_left], [false, false, 1]);
});

test("the 3rd wrong try locks the email for 5 minutes", async () => {
  const db = await freshDb();
  await wrongTry(db, A);
  await wrongTry(db, A);
  const r = await wrongTry(db, A);

  assert.equal(r.locked, true);
  assert.ok(r.retry_after_seconds >= 299 && r.retry_after_seconds <= 300, `${r.retry_after_seconds}s`);
});

test("while locked the next attempt is refused before any password is checked", async () => {
  const db = await freshDb();
  for (let i = 0; i < 3; i++) await wrongTry(db, A);

  const r = await begin(db, A);
  assert.equal(r.locked, true);
  assert.ok(r.retry_after_seconds > 0 && r.retry_after_seconds <= 300);

  const before = (await row(db, A)).attempts;
  await begin(db, A);
  assert.equal((await row(db, A)).attempts, before, "blocked tries don't keep counting");
});

test("other emails are unaffected", async () => {
  const db = await freshDb();
  for (let i = 0; i < 3; i++) await wrongTry(db, A);

  assert.equal((await begin(db, "someone-else@test.com")).locked, false);
});

test("after the 5 minutes pass, sign-in is allowed again and the count restarts", async () => {
  const db = await freshDb();
  for (let i = 0; i < 3; i++) await wrongTry(db, A);
  await db.query("update public.login_attempts set locked_until = now() - interval '1 second' where email=$1", [A]);

  assert.equal((await begin(db, A)).locked, false);
  assert.equal((await row(db, A)).attempts, 1);
});

test("a successful sign-in forgets earlier failures", async () => {
  const db = await freshDb();
  await wrongTry(db, A);
  await wrongTry(db, A);
  await clear(db, A);

  assert.equal(await row(db, A), undefined);
  assert.equal((await wrongTry(db, A)).attempts_left, 2);
});

test("failures older than 15 minutes don't count toward a lock", async () => {
  const db = await freshDb();
  await begin(db, A);
  await failed(db, A);
  await db.query("update public.login_attempts set last_attempt_at = now() - interval '20 minutes' where email=$1", [A]);

  await begin(db, A);
  assert.equal((await row(db, A)).attempts, 1);
});

test("a 4th attempt that raced past the 3rd failure is locked, not let through", async () => {
  const db = await freshDb();
  await begin(db, A);
  await begin(db, A);
  await begin(db, A); // 3 counted, no failure registered yet

  const r = await begin(db, A);
  assert.equal(r.locked, true);
  assert.equal(r.retry_after_seconds, 300);
});

test("20 simultaneous guesses: at most 3 are let through", async () => {
  const db = await freshDb();
  const results = await Promise.all(Array.from({ length: 20 }, () => begin(db, A)));

  assert.ok(results.filter((r) => !r.locked).length <= 3);
});

test("an email with no account locks exactly like a real one (no account enumeration)", async () => {
  const db = await freshDb();
  const ghost = "does-not-exist@nowhere.test";
  await wrongTry(db, ghost);
  await wrongTry(db, ghost);

  assert.equal((await wrongTry(db, ghost)).locked, true);
});

test("the public roles can neither call the functions nor read the table", async () => {
  const db = await freshDb();
  await begin(db, "victim@test.com");

  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      db.exec(`set role ${role}; select * from public.login_attempt_begin('x@x.com');`),
      /permission denied/i,
      role
    );
    await db.exec("reset role");

    await db.exec(`set role ${role}`);
    const seen = (await db.query("select count(*)::int c from public.login_attempts")).rows[0].c;
    await db.exec("reset role");
    assert.equal(seen, 0, `${role} saw rows`);
  }
});

test("the app's own role (service_role) can use the functions", async () => {
  const db = await freshDb();
  await db.exec("set role service_role");
  await assert.doesNotReject(db.query("select * from public.login_attempt_begin('ok@x.com')"));
  await db.exec("reset role");
});

test("running the migration twice is harmless", async () => {
  const db = await freshDb();
  await assert.doesNotReject(db.exec(migration));
});
