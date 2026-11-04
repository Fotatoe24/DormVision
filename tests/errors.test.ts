import test from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "@/lib/errors";

test.beforeEach(() => {
  console.error = () => {}; // friendlyError logs the real error server-side on purpose
});

const FALLBACK = "Custom fallback.";

const cases: Array<[string, unknown, string]> = [
  [
    "duplicate room number",
    { code: "23505", message: 'duplicate key value violates unique constraint "rooms_dorm_id_room_number_key"' },
    "A room with that number already exists.",
  ],
  [
    "duplicate email",
    { code: "23505", message: 'duplicate key value violates unique constraint "users_email_unique"' },
    "That email address is already registered.",
  ],
  [
    "a second pending request",
    { code: "23505", message: 'duplicate key ... "tenant_registration_requests_pending_unique_idx"' },
    "There is already a pending request for that dormitory.",
  ],
  [
    "a second pending payment on one bill",
    { code: "23505", message: 'duplicate key ... "payments_one_pending_per_bill_idx"' },
    "A payment report is already waiting for review on this bill.",
  ],
  [
    "an unknown duplicate",
    { code: "23505", message: 'duplicate key ... "something_new_key"' },
    "That already exists.",
  ],
  [
    "a foreign-key block",
    { code: "23503", message: 'violates foreign key constraint "tenants_room_id_fkey"' },
    "That can't be changed because other records still depend on it.",
  ],
  [
    "a bad enum value",
    { code: "22P02", message: 'invalid input value for enum room_status: "inactive"' },
    "One of the values isn't valid. Please check it and try again.",
  ],
  [
    "a network failure",
    { message: "TypeError: fetch failed" },
    "We couldn't reach the server. Please check your connection and try again.",
  ],
  ["an unknown error", { code: "XX000", message: "internal error leaking table names" }, FALLBACK],
  ["no error object", null, FALLBACK],
];

for (const [name, error, expected] of cases) {
  test(`says the right thing for ${name}`, () => {
    assert.equal(friendlyError(error as never, FALLBACK), expected);
  });

  test(`never leaks database internals for ${name}`, () => {
    const out = friendlyError(error as never, FALLBACK);
    assert.doesNotMatch(out, /constraint|violates|enum|duplicate key|_key|_idx|table|fkey/i);
  });
}

test("falls back to a generic sentence when none is supplied", () => {
  assert.equal(friendlyError(null), "Something went wrong. Please try again.");
});
