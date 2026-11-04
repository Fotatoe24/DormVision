import test from "node:test";
import assert from "node:assert/strict";
import { dormStatus, dormStatusLabels } from "@/lib/dorm-status";
import { validatePassword, MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/password-policy";

test("dorm status: suspended beats pending beats active", () => {
  assert.equal(dormStatus({ approved_at: "2026-01-01", suspended_at: null }), "active");
  assert.equal(dormStatus({ approved_at: null, suspended_at: null }), "pending");
  assert.equal(dormStatus({ approved_at: null, suspended_at: "2026-02-01" }), "suspended");
  assert.equal(dormStatus({ approved_at: "2026-01-01", suspended_at: "2026-02-01" }), "suspended");
});

test("dorm status: columns that don't exist yet read as active", () => {
  assert.equal(dormStatus({}), "active");
});

test("every status has a label", () => {
  for (const state of ["active", "pending", "suspended"] as const) {
    assert.ok(dormStatusLabels[state]);
  }
});

test("the platform admin needs a longer password than everyone else", () => {
  const eleven = "Tr0ub4dor&3";
  assert.equal(eleven.length, 11);
  assert.equal(validatePassword(eleven), null); // fine for an owner or tenant
  assert.match(validatePassword(eleven, { role: "platform_admin" }) ?? "", /at least 12/);
  assert.equal(validatePassword(eleven + "x", { role: "platform_admin" }), null);
  assert.equal(MIN_ADMIN_PASSWORD_LENGTH, 12);
});

test("the other password rules still apply to the admin", () => {
  assert.match(validatePassword("a".repeat(20), { role: "platform_admin" }) ?? "", /repeated/);
  assert.match(
    validatePassword("x".repeat(80) + "1", { role: "platform_admin" }) ?? "",
    /too long/
  );
});

test("an admin session is short; everyone else's is a week", async () => {
  process.env.JWT_SECRET ??= "test-secret-for-unit-tests-only-0123456789";
  const { sessionLifetimeSeconds } = await import("@/lib/jwt");

  assert.equal(sessionLifetimeSeconds("platform_admin"), 8 * 3600);
  assert.equal(sessionLifetimeSeconds("owner"), 7 * 86400);
  assert.equal(sessionLifetimeSeconds("tenant"), 7 * 86400);
});
