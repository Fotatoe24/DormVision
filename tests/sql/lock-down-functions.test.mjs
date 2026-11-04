import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../../supabase/migrations/0023_lock_down_rpc_functions.sql", import.meta.url),
  "utf8"
);

// Reproduces the LIVE state that migration 0023 was written against (taken from
// pg_proc on the real project): the same seven SECURITY DEFINER functions,
// executable by PUBLIC, anon, authenticated and service_role, and
// lookup_dormitory_by_code without a pinned search_path.
const FUNCTIONS = [
  { name: "create_owner_account", args: "p_user_id uuid, p_full_name text, p_email text, p_dorm_name text, p_password_hash text", types: "uuid, text, text, text, text", returns: "uuid", body: "select p_user_id", call: "public.create_owner_account(gen_random_uuid(),'x','x@x.com','d','h')", pinned: true },
  { name: "get_or_create_invoice_number", args: "p_bill_id uuid", types: "uuid", returns: "text", body: "select 'INV-1'::text", call: "public.get_or_create_invoice_number(gen_random_uuid())", pinned: true },
  { name: "get_or_create_receipt_number", args: "p_payment_id uuid", types: "uuid", returns: "text", body: "select 'RCT-1'::text", call: "public.get_or_create_receipt_number(gen_random_uuid())", pinned: true },
  { name: "lookup_dormitory_by_code", args: "p_code text", types: "text", returns: "text", body: "select 'dorm'::text", call: "public.lookup_dormitory_by_code('ABC')", pinned: false },
  { name: "is_owner", args: "", types: "", returns: "boolean", body: "select true", call: "public.is_owner()", pinned: true },
  { name: "user_dorm_id", args: "", types: "", returns: "uuid", body: "select null::uuid", call: "public.user_dorm_id()", pinned: true },
  { name: "user_room_id", args: "", types: "", returns: "uuid", body: "select null::uuid", call: "public.user_room_id()", pinned: true },
];

async function liveStateDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const f of FUNCTIONS) {
    await db.exec(
      `create function public.${f.name}(${f.args}) returns ${f.returns} language sql security definer ${f.pinned ? "set search_path = public" : ""} as $$ ${f.body} $$;`
    );
    await db.exec(`grant execute on function public.${f.name}(${f.types}) to anon, authenticated, service_role;`);
  }
  return db;
}

const acl = async (db, name) =>
  (await db.query("select proacl::text a, proconfig c from pg_proc where proname=$1", [name])).rows[0];

test("the fixture really is vulnerable before the migration (anon can create owner accounts)", async () => {
  const db = await liveStateDb();

  await assert.doesNotReject(db.exec(`set role anon; select ${FUNCTIONS[0].call};`));
  await db.exec("reset role");
  assert.match((await acl(db, "create_owner_account")).a, /^\{=X\//); // PUBLIC has EXECUTE
});

for (const f of FUNCTIONS) {
  test(`after 0023, ${f.name} is callable only by the owner and service_role`, async () => {
    const db = await liveStateDb();
    await db.exec(migration);

    const grantees = (await acl(db, f.name)).a
      .replace(/[{}]/g, "")
      .split(",")
      .map((entry) => entry.split("=")[0] || "PUBLIC")
      .sort();
    assert.deepEqual(grantees, ["postgres", "service_role"]);

    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(db.exec(`set role ${role}; select ${f.call};`), /permission denied/i, role);
      await db.exec("reset role");
    }

    await assert.doesNotReject(db.exec(`set role service_role; select ${f.call};`));
    await db.exec("reset role");
  });
}

test("lookup_dormitory_by_code now has a pinned search_path", async () => {
  const db = await liveStateDb();
  assert.equal((await acl(db, "lookup_dormitory_by_code")).c, null);

  await db.exec(migration);

  assert.match(String((await acl(db, "lookup_dormitory_by_code")).c), /search_path=public/);
});

test("running the migration twice is harmless", async () => {
  const db = await liveStateDb();
  await db.exec(migration);
  await assert.doesNotReject(db.exec(migration));
});
