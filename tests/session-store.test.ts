import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionRow,
  isSessionActive,
  revokeSession,
  revokeUserSessions,
} from "@/lib/session-store";

test.beforeEach(() => {
  console.error = () => {};
});

// A stand-in for the Supabase client: every chain of calls records itself and
// finally resolves to whatever result was programmed.
function fake(result: { data?: unknown; error?: unknown }) {
  const calls: unknown[][] = [];
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), ...args]);
          return chain;
        };
      },
    }
  );
  return {
    calls,
    admin: {
      from: (table: string) => {
        calls.push(["from", table]);
        return chain;
      },
    } as never,
  };
}

const DAY = 86_400_000;
const future = () => new Date(Date.now() + DAY).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();
const MISSING_TABLE = { code: "PGRST205" };

const payload = (sid?: string) => ({
  id: "u1",
  email: "a@b.c",
  fullName: "A",
  role: "owner" as const,
  dormId: null,
  ...(sid ? { sid } : {}),
});

test("a cookie whose session is live is valid", async () => {
  const { admin } = fake({ data: { id: "s", user_id: "u1", expires_at: future() } });
  assert.equal(await isSessionActive(admin, payload("s")), true);
});

test("a revoked session (no row) is not valid", async () => {
  assert.equal(await isSessionActive(fake({ data: null }).admin, payload("s")), false);
});

test("a session id belonging to someone else is not valid", async () => {
  const { admin } = fake({ data: { id: "s", user_id: "OTHER", expires_at: future() } });
  assert.equal(await isSessionActive(admin, payload("s")), false);
});

test("an expired session is not valid", async () => {
  const { admin } = fake({ data: { id: "s", user_id: "u1", expires_at: past() } });
  assert.equal(await isSessionActive(admin, payload("s")), false);
});

test("a database error fails closed", async () => {
  assert.equal(await isSessionActive(fake({ error: { code: "57P01" } }).admin, payload("s")), false);
});

test("sessions table not created yet -> still valid (the old behaviour)", async () => {
  assert.equal(await isSessionActive(fake({ error: MISSING_TABLE }).admin, payload("s")), true);
});

test("a cookie from before sessions existed is accepted only until the table does", async () => {
  assert.equal(await isSessionActive(fake({ error: MISSING_TABLE }).admin, payload()), true);
  assert.equal(await isSessionActive(fake({ data: [] }).admin, payload()), false); // retired
  assert.equal(await isSessionActive(fake({ error: { code: "57P01" } }).admin, payload()), false);
});

test("logout deletes exactly that session", async () => {
  const f = fake({});
  await revokeSession(f.admin, "sid-1");
  assert.deepEqual(f.calls, [["from", "user_sessions"], ["delete"], ["eq", "id", "sid-1"]]);
});

test("a password CHANGE deletes the user's other sessions but keeps the current one", async () => {
  const f = fake({});
  await revokeUserSessions(f.admin, "u1", "keep-me");
  assert.deepEqual(f.calls, [
    ["from", "user_sessions"],
    ["delete"],
    ["eq", "user_id", "u1"],
    ["neq", "id", "keep-me"],
  ]);
});

test("a password RESET deletes all of the user's sessions", async () => {
  const f = fake({});
  await revokeUserSessions(f.admin, "u1");
  assert.deepEqual(f.calls, [["from", "user_sessions"], ["delete"], ["eq", "user_id", "u1"]]);
});

test("signing in returns the new session's id, valid for 7 days, for that user", async () => {
  const realRandom = Math.random;
  Math.random = () => 0.5; // skip the occasional housekeeping delete
  try {
    const f = fake({ data: { id: "new-sid" } });
    assert.equal(await createSessionRow(f.admin, "u1"), "new-sid");

    const inserted = f.calls.find((c) => c[0] === "insert")?.[1] as { user_id: string; expires_at: string };
    assert.equal(inserted.user_id, "u1");
    const days = (new Date(inserted.expires_at).getTime() - Date.now()) / DAY;
    assert.ok(Math.abs(days - 7) < 0.01, `expires in ${days} days`);
  } finally {
    Math.random = realRandom;
  }
});

test("no sessions table yet -> no id (cookie-only, as before); any other failure is raised", async () => {
  const realRandom = Math.random;
  Math.random = () => 0.5;
  try {
    assert.equal(await createSessionRow(fake({ error: MISSING_TABLE }).admin, "u1"), null);
    await assert.rejects(createSessionRow(fake({ error: { code: "XX000", message: "boom" } }).admin, "u1"));
  } finally {
    Math.random = realRandom;
  }
});
