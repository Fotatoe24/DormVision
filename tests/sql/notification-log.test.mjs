import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../../supabase/migrations/0030_notification_log.sql", import.meta.url),
  "utf8"
);

async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec("create table public.bills (id uuid primary key default gen_random_uuid());");
  await db.exec(migration);
  const bill = async () => (await db.query("insert into public.bills default values returning id")).rows[0].id;
  const claim = (id, kind) =>
    db.query(
      "insert into public.notification_log (bill_id, kind) values ($1, $2) on conflict (bill_id, kind) do nothing returning id",
      [id, kind]
    );
  return { db, bill, claim };
}

test("the first claim wins; a second claim for the same bill and kind gets nothing", async () => {
  const { bill, claim } = await freshDb();
  const id = await bill();

  assert.equal((await claim(id, "payment_reminder")).rows.length, 1);
  assert.equal((await claim(id, "payment_reminder")).rows.length, 0);
});

test("a reminder and an overdue notice for the same bill are independent", async () => {
  const { bill, claim } = await freshDb();
  const id = await bill();

  assert.equal((await claim(id, "payment_reminder")).rows.length, 1);
  assert.equal((await claim(id, "overdue_notice")).rows.length, 1);
});

test("a released claim (failed email) can be claimed again", async () => {
  const { db, bill, claim } = await freshDb();
  const id = await bill();
  const first = (await claim(id, "overdue_notice")).rows[0].id;

  await db.query("delete from public.notification_log where id = $1", [first]);
  assert.equal((await claim(id, "overdue_notice")).rows.length, 1);
});

test("only the two known kinds are accepted", async () => {
  const { bill, claim } = await freshDb();
  await assert.rejects(claim(await bill(), "newsletter"), /check|violates/i);
});

test("deleting a bill clears its log rows", async () => {
  const { db, bill, claim } = await freshDb();
  const id = await bill();
  await claim(id, "payment_reminder");

  await db.query("delete from public.bills where id = $1", [id]);
  assert.equal((await db.query("select count(*)::int c from public.notification_log")).rows[0].c, 0);
});

test("the public roles can't read or write the log (RLS)", async () => {
  const { db, bill, claim } = await freshDb();
  const id = await bill();
  await claim(id, "payment_reminder");

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    assert.equal((await db.query("select count(*)::int c from public.notification_log")).rows[0].c, 0, `${role} read`);
    await assert.rejects(
      db.query("insert into public.notification_log (bill_id, kind) values ($1, 'overdue_notice')", [id]),
      /row-level security|violates|permission denied/i,
      `${role} wrote`
    );
    await db.exec("reset role");
  }
});

test("running the migration twice is harmless and keeps the log", async () => {
  const { db, bill, claim } = await freshDb();
  await claim(await bill(), "payment_reminder");

  await assert.doesNotReject(db.exec(migration));
  assert.equal((await db.query("select count(*)::int c from public.notification_log")).rows[0].c, 1);
});
