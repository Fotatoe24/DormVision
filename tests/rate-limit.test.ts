import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

// A stand-in for the Supabase client that records what was asked of it.
function fakeAdmin(result: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    admin: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push([name, args]);
        return { data: null, error: null, ...result };
      },
    } as never,
  };
}

test.beforeEach(() => {
  console.error = () => {}; // the "limiter unavailable" paths log on purpose
});

test("an allowed hit passes through", async () => {
  const { admin } = fakeAdmin({ data: [{ allowed: true, retry_after_seconds: 0 }] });
  assert.deepEqual(await checkRateLimit(admin, "k", 3, 60), { allowed: true, retryAfterSeconds: 0 });
});

test("a blocked hit reports how long to wait", async () => {
  const { admin } = fakeAdmin({ data: [{ allowed: false, retry_after_seconds: 420 }] });
  assert.deepEqual(await checkRateLimit(admin, "k", 3, 60), { allowed: false, retryAfterSeconds: 420 });
});

test("sends the key, limit and window to the database function", async () => {
  const { admin, calls } = fakeAdmin({ data: [{ allowed: true }] });
  await checkRateLimit(admin, "reset:email:a@b.c", 3, 900);

  assert.deepEqual(calls, [["rate_limit_hit", { p_key: "reset:email:a@b.c", p_max: 3, p_window_seconds: 900 }]]);
});

test("keys are capped at 200 characters", async () => {
  const { admin, calls } = fakeAdmin({ data: [{ allowed: true }] });
  await checkRateLimit(admin, "x".repeat(5000), 3, 60);

  assert.equal((calls[0][1].p_key as string).length, 200);
});

test("migration not applied yet -> requests are allowed, not blocked", async () => {
  const { admin } = fakeAdmin({ error: { code: "PGRST202" } });
  assert.equal((await checkRateLimit(admin, "k", 3, 60)).allowed, true);
});

test("a database error never locks anyone out", async () => {
  const { admin } = fakeAdmin({ error: { code: "57P01" } });
  assert.equal((await checkRateLimit(admin, "k", 3, 60)).allowed, true);
});

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

test("client IP is the first x-forwarded-for entry", () => {
  assert.equal(clientIpFrom(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(clientIpFrom(headers({ "x-forwarded-for": " 203.0.113.9 " })), "203.0.113.9");
});

test("falls back to x-real-ip, then 'unknown'", () => {
  assert.equal(clientIpFrom(headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(clientIpFrom(headers({})), "unknown");
});

test("an absurdly long header can't become a key", () => {
  assert.equal(clientIpFrom(headers({ "x-forwarded-for": "9".repeat(500) })), "unknown");
});
