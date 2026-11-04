import test from "node:test";
import assert from "node:assert/strict";
import {
  beginLoginAttempt,
  clearLoginAttempts,
  describeWait,
  invalidCredentialsMessage,
  lockedMessage,
  recordFailedLogin,
} from "@/lib/login-lockout";

test.beforeEach(() => {
  console.error = () => {}; // the unavailable-limiter paths log on purpose
});

// A stand-in for the Supabase client: returns one programmed result for rpc().
function fake(data: unknown, error: unknown = null) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    admin: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push([name, args]);
        return { data, error };
      },
    } as never,
  };
}

test("wait times are rounded UP, so nobody is told to retry too early", () => {
  assert.equal(describeWait(300), "5 minutes");
  assert.equal(describeWait(299), "5 minutes");
  assert.equal(describeWait(61), "2 minutes");
  assert.equal(describeWait(60), "1 minute");
  assert.equal(describeWait(40), "40 seconds");
  assert.equal(describeWait(1), "1 second");
  assert.equal(describeWait(0), "1 second"); // never "0 seconds"
});

test("the messages shown on the login page", () => {
  assert.equal(lockedMessage(300), "Too many failed attempts. Please try again in 5 minutes.");
  assert.equal(invalidCredentialsMessage(2), "Invalid email or password. 2 tries left before a 5-minute lock.");
  assert.equal(invalidCredentialsMessage(1), "Invalid email or password. 1 try left before a 5-minute lock.");
  assert.equal(invalidCredentialsMessage(null), "Invalid email or password.");
});

test("begin(): a locked email passes through with its wait time", async () => {
  const { admin } = fake([{ locked: true, retry_after_seconds: 240 }]);
  assert.deepEqual(await beginLoginAttempt(admin, "a@b.c"), { locked: true, retryAfterSeconds: 240 });
});

test("begin(): an allowed attempt", async () => {
  const { admin } = fake([{ locked: false, retry_after_seconds: 0 }]);
  assert.deepEqual(await beginLoginAttempt(admin, "a@b.c"), { locked: false, retryAfterSeconds: 0 });
});

test("begin(): migration 0021 not applied -> sign-in still works", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const { admin } = fake(null, { code });
    assert.deepEqual(await beginLoginAttempt(admin, "a@b.c"), { locked: false, retryAfterSeconds: 0 }, code);
  }
});

test("begin(): a real database error is reported, not silently treated as success", async () => {
  const { admin } = fake(null, { code: "57P01" });
  assert.deepEqual(await beginLoginAttempt(admin, "a@b.c"), { locked: false, retryAfterSeconds: 0, failed: true });
});

test("failed(): the 3rd wrong try locks, the 1st leaves two tries", async () => {
  assert.deepEqual(
    await recordFailedLogin(fake([{ locked: true, retry_after_seconds: 300, attempts_left: 0 }]).admin, "a@b.c"),
    { locked: true, retryAfterSeconds: 300, attemptsLeft: 0 }
  );
  assert.deepEqual(
    await recordFailedLogin(fake([{ locked: false, retry_after_seconds: 0, attempts_left: 2 }]).admin, "a@b.c"),
    { locked: false, retryAfterSeconds: 0, attemptsLeft: 2 }
  );
});

test("failed(): if it can't run, the plain message is used", async () => {
  const { admin } = fake(null, { code: "XX000" });
  assert.deepEqual(await recordFailedLogin(admin, "a@b.c"), { locked: false, retryAfterSeconds: 0, attemptsLeft: null });
});

test("the email key is capped so nobody can stuff the table with giant strings", async () => {
  const { admin, calls } = fake([{ locked: false }]);
  await beginLoginAttempt(admin, "x".repeat(5000));
  assert.equal((calls[0][1].p_email as string).length, 254);
});

test("clear() calls the right function", async () => {
  const { admin, calls } = fake(null);
  await clearLoginAttempts(admin, "a@b.c");
  assert.deepEqual(calls, [["login_attempt_clear", { p_email: "a@b.c" }]]);
});
