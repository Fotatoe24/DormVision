import test from "node:test";
import assert from "node:assert/strict";
import { accessBlock, accessBlockMessage, findAccessBlock } from "@/lib/account-access";

const live = { suspended_at: null, approved_at: "2026-01-01T00:00:00Z" };

test("an ordinary account in an approved dorm may sign in", () => {
  assert.equal(accessBlock({ disabled_at: null }, live), null);
});

test("a disabled account is blocked, even without a dorm (the platform admin)", () => {
  assert.equal(accessBlock({ disabled_at: "2026-11-01T00:00:00Z" }, null), "disabled");
  assert.equal(accessBlock({ disabled_at: "2026-11-01T00:00:00Z" }, live), "disabled");
});

test("a suspended dorm blocks its people", () => {
  assert.equal(accessBlock({}, { ...live, suspended_at: "2026-11-01T00:00:00Z" }), "suspended");
});

test("a dorm awaiting approval blocks its owner", () => {
  assert.equal(accessBlock({}, { suspended_at: null, approved_at: null }), "pending");
});

test("suspended wins over pending, disabled wins over both", () => {
  const both = { suspended_at: "2026-11-01T00:00:00Z", approved_at: null };
  assert.equal(accessBlock({}, both), "suspended");
  assert.equal(accessBlock({ disabled_at: "x" }, both), "disabled");
});

test("columns that don't exist yet (migration not run) never block anyone", () => {
  assert.equal(accessBlock({}, {}), null); // approved_at is undefined, not null
});

test("every block has a message that says what to do", () => {
  for (const block of ["disabled", "suspended", "pending"] as const) {
    assert.ok(accessBlockMessage(block).length > 20);
  }
});

// A minimal stand-in for the two queries findAccessBlock makes.
function fakeAdmin(tables: Record<string, { data?: unknown; error?: { code: string } | null }>) {
  return {
    from: (table: string) => {
      const result = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as never;
}

test("lookup: blocks a person whose dorm is suspended", async () => {
  const admin = fakeAdmin({
    users: { data: { disabled_at: null } },
    dormitories: { data: { suspended_at: "2026-11-01T00:00:00Z", approved_at: "2026-01-01T00:00:00Z" } },
  });
  assert.equal(await findAccessBlock(admin, "u1", "d1"), "suspended");
});

test("lookup: a missing column (migration not applied) fails open", async () => {
  for (const code of ["42703", "PGRST204", "PGRST205", "42P01"]) {
    const admin = fakeAdmin({ users: { error: { code } } });
    assert.equal(await findAccessBlock(admin, "u1", "d1"), null, code);
  }
});

test("lookup: any other database error fails closed (throws, so nobody is signed in)", async () => {
  const admin = fakeAdmin({ users: { error: { code: "57P01" } } });
  await assert.rejects(findAccessBlock(admin, "u1", null));
});

test("lookup: an account that no longer exists is blocked", async () => {
  assert.equal(await findAccessBlock(fakeAdmin({ users: { data: null } }), "gone", null), "disabled");
});
