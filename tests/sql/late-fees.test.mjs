import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../../supabase/migrations/0029_late_fees.sql", import.meta.url),
  "utf8"
);

// The two tables 0029 touches, as they are live: bills with total_amount GENERATED
// from rent + other charges, and dorm_settings with the fee and grace days.
async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  await db.exec(`
    create type public.bill_status as enum ('unpaid', 'partial', 'paid', 'overdue');
    create table public.dorm_settings (
      dorm_id uuid primary key,
      grace_period_days int not null default 0,
      late_payment_fee numeric(10,2) not null default 0
    );
    create table public.bills (
      id uuid primary key default gen_random_uuid(),
      dorm_id uuid not null,
      due_date date not null,
      rent_amount numeric(10,2) not null default 0,
      other_charges numeric(10,2) not null default 0,
      total_amount numeric(10,2) generated always as (rent_amount + other_charges) stored,
      amount_paid numeric(10,2) not null default 0,
      status public.bill_status not null default 'unpaid'
    );
  `);
  await db.exec(migration);

  const DORM = "11111111-1111-1111-1111-111111111111";
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const settings = (dorm, fee, grace) =>
    db.query(
      `insert into public.dorm_settings (dorm_id, grace_period_days, late_payment_fee) values ($1, $2, $3)
       on conflict (dorm_id) do update set grace_period_days = $2, late_payment_fee = $3`,
      [dorm, grace, fee]
    );
  const bill = async (dorm, daysAgo, status = "unpaid", paid = 0) =>
    (await db.query(
      `insert into public.bills (dorm_id, due_date, rent_amount, amount_paid, status)
       values ($1, ((now() at time zone 'Asia/Manila')::date - $2::int), 2000, $3, $4) returning id`,
      [dorm, daysAgo, paid, status]
    )).rows[0].id;
  const row = async (id) =>
    (await db.query("select late_fee::float lf, total_amount::float total, late_fee_charged_at is not null charged from public.bills where id=$1", [id])).rows[0];
  const charge = async (dorm) =>
    (await db.query("select public.charge_late_fees($1) as n", [dorm])).rows[0].n;

  return { db, DORM, OTHER, settings, bill, row, charge };
}

test("the fee lands on a bill that is past due + grace, and total_amount includes it", async () => {
  const { DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 3);
  const late = await bill(DORM, 5); // due 5 days ago, 3 days grace: overdue

  assert.equal(await charge(DORM), 1);
  assert.deepEqual(await row(late), { lf: 200, total: 2200, charged: true });
});

test("not before the grace period is over: the boundary is the day AFTER due + grace", async () => {
  const { DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 3);
  const today = await bill(DORM, 0);
  const lastGraceDay = await bill(DORM, 3); // due+3 = today: still within grace
  const firstLateDay = await bill(DORM, 4); // due+3 = yesterday: now late

  assert.equal(await charge(DORM), 1);
  assert.equal((await row(today)).lf, 0);
  assert.equal((await row(lastGraceDay)).lf, 0);
  assert.equal((await row(firstLateDay)).lf, 200);
});

test("zero grace: overdue from the day after the due date", async () => {
  const { DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 100, 0);
  const dueToday = await bill(DORM, 0);
  const dueYesterday = await bill(DORM, 1);

  await charge(DORM);
  assert.equal((await row(dueToday)).lf, 0);
  assert.equal((await row(dueYesterday)).lf, 100);
});

test("charged once only: running it again, or after the fee setting changes, adds nothing", async () => {
  const { DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 0);
  const late = await bill(DORM, 10);

  assert.equal(await charge(DORM), 1);
  assert.equal(await charge(DORM), 0);
  await settings(DORM, 500, 0); // owner raises the fee afterwards
  assert.equal(await charge(DORM), 0);
  assert.equal((await row(late)).lf, 200, "the original fee stands");
  assert.equal((await row(late)).total, 2200, "never added twice");
});

test("paid bills are never charged; partly paid ones are", async () => {
  const { DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 0);
  const paid = await bill(DORM, 10, "paid", 2000);
  const partial = await bill(DORM, 10, "partial", 500);

  await charge(DORM);
  assert.equal((await row(paid)).lf, 0);
  assert.equal((await row(partial)).lf, 200);
});

test("a waived fee is never charged again", async () => {
  const { db, DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 0);
  const late = await bill(DORM, 10);
  await charge(DORM);

  await db.query("update public.bills set late_fee = 0, late_fee_waived_at = now() where id = $1", [late]);
  assert.equal(await charge(DORM), 0);
  assert.deepEqual(await row(late), { lf: 0, total: 2000, charged: true });
});

test("a fee of 0 charges nothing, and a dorm with no settings row charges nothing", async () => {
  const { DORM, OTHER, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 0, 0);
  const late = await bill(DORM, 10);
  const noSettings = await bill(OTHER, 10);

  assert.equal(await charge(DORM), 0);
  assert.equal(await charge(OTHER), 0);
  assert.equal((await row(late)).lf, 0);
  assert.equal((await row(noSettings)).lf, 0);
});

test("one dorm's sweep never touches another dorm's bills", async () => {
  const { DORM, OTHER, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 0);
  await settings(OTHER, 999, 0);
  const mine = await bill(DORM, 10);
  const theirs = await bill(OTHER, 10);

  await charge(DORM);
  assert.equal((await row(mine)).lf, 200);
  assert.equal((await row(theirs)).lf, 0);
});

test("the fee can't be negative", async () => {
  const { db, DORM, bill } = await freshDb();
  const id = await bill(DORM, 1);
  await assert.rejects(db.query("update public.bills set late_fee = -5 where id = $1", [id]), /check|violates/i);
});

test("only the server can run the sweep (not the public API roles)", async () => {
  const { db, DORM } = await freshDb();

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select public.charge_late_fees($1)", [DORM]), /permission denied/i, role);
    await db.exec("reset role");
  }

  await db.exec("set role service_role");
  await assert.doesNotReject(db.query("select public.charge_late_fees($1)", [DORM]));
  await db.exec("reset role");
});

test("running the migration twice is harmless and keeps existing fees", async () => {
  const { db, DORM, settings, bill, row, charge } = await freshDb();
  await settings(DORM, 200, 0);
  const late = await bill(DORM, 10);
  await charge(DORM);

  await assert.doesNotReject(db.exec(migration));
  assert.deepEqual(await row(late), { lf: 200, total: 2200, charged: true });
});
