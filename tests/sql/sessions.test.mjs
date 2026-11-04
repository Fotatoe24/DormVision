import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../../supabase/migrations/0022_user_sessions.sql", import.meta.url),
  "utf8"
);

// Supabase's default grants (the public roles can touch new tables) so that it
// is row-level security, and not a missing grant, that is being tested.
async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec("create table public.users (id uuid primary key default gen_random_uuid(), email text);");
  await db.exec(migration);

  const user = async (email) =>
    (await db.query("insert into public.users (email) values ($1) returning id", [email])).rows[0].id;
  const session = async (userId, expires = "now() + interval '7 days'") =>
    (await db.query(`insert into public.user_sessions (user_id, expires_at) values ($1, ${expires}) returning id`, [userId])).rows[0].id;
  const exists = async (id) =>
    (await db.query("select 1 from public.user_sessions where id=$1", [id])).rows.length === 1;

  return { db, user, session, exists };
}

test("logout ends exactly that one session", async () => {
  const { db, user, session, exists } = await freshDb();
  const alice = await user("alice@t.com");
  const laptop = await session(alice);
  const phone = await session(alice);

  await db.query("delete from public.user_sessions where id = $1", [laptop]);

  assert.equal(await exists(laptop), false);
  assert.equal(await exists(phone), true);
});

test("a password CHANGE keeps the current session and ends the user's others", async () => {
  const { db, user, session, exists } = await freshDb();
  const alice = await user("alice@t.com");
  const bob = await user("bob@t.com");
  const phone = await session(alice);
  const tablet = await session(alice);
  const bobs = await session(bob);

  await db.query("delete from public.user_sessions where user_id = $1 and id <> $2", [alice, phone]);

  assert.equal(await exists(phone), true);
  assert.equal(await exists(tablet), false);
  assert.equal(await exists(bobs), true, "someone else's session is untouched");
});

test("a password RESET ends all of the user's sessions", async () => {
  const { db, user, session, exists } = await freshDb();
  const alice = await user("alice@t.com");
  const bob = await user("bob@t.com");
  const a1 = await session(alice);
  const a2 = await session(alice);
  const bobs = await session(bob);

  await db.query("delete from public.user_sessions where user_id = $1", [alice]);

  assert.equal(await exists(a1) || await exists(a2), false);
  assert.equal(await exists(bobs), true);
});

test("expiry and ownership are what 'valid' means", async () => {
  const { db, user, session } = await freshDb();
  const alice = await user("alice@t.com");
  const bob = await user("bob@t.com");
  const live = await session(bob);
  const old = await session(bob, "now() - interval '1 minute'");
  const valid = async (id, uid) =>
    (await db.query("select 1 from public.user_sessions where id=$1 and user_id=$2 and expires_at > now()", [id, uid])).rows.length === 1;

  assert.equal(await valid(live, bob), true);
  assert.equal(await valid(old, bob), false, "expired");
  assert.equal(await valid(live, alice), false, "a session id is not valid for a different user");
});

test("housekeeping removes expired rows and only those", async () => {
  const { db, user, session, exists } = await freshDb();
  const bob = await user("bob@t.com");
  const live = await session(bob);
  const old = await session(bob, "now() - interval '1 minute'");

  await db.query("delete from public.user_sessions where expires_at < now()");

  assert.equal(await exists(old), false);
  assert.equal(await exists(live), true);
});

test("deleting a user takes their sessions with them", async () => {
  const { db, user, session, exists } = await freshDb();
  const bob = await user("bob@t.com");
  const s = await session(bob);

  await db.query("delete from public.users where id = $1", [bob]);

  assert.equal(await exists(s), false);
});

test("the public roles can't read, forge or delete sessions (RLS, with default grants in place)", async () => {
  const { db, user, session } = await freshDb();
  const alice = await user("alice@t.com");
  await session(alice);
  const owner = async () => (await db.query("select count(*)::int c from public.user_sessions")).rows[0].c;

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    const seen = (await db.query("select count(*)::int c from public.user_sessions")).rows[0].c;
    assert.equal(seen, 0, `${role} saw sessions`);

    await assert.rejects(
      db.exec("insert into public.user_sessions (user_id, expires_at) values (gen_random_uuid(), now())"),
      /row-level security|violates/i,
      `${role} forged one`
    );
    await db.exec("delete from public.user_sessions");
    await db.exec("reset role");
    assert.equal(await owner(), 1, `${role} deleted sessions`);
  }
});

test("running the migration twice is harmless", async () => {
  const { db } = await freshDb();
  await assert.doesNotReject(db.exec(migration));
});
