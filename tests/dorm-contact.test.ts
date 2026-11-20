import test from "node:test";
import assert from "node:assert/strict";
import { CONTACT_LIMITS, hasDormContact, parseDormContact, telHref } from "@/lib/dorm-contact";

const ok = (input: Record<string, unknown>) => {
  const result = parseDormContact(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.value : null!;
};
const error = (input: Record<string, unknown>) => {
  const result = parseDormContact(input);
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error;
};

test("normal input is trimmed and kept; the email is lower-cased", () => {
  assert.deepEqual(
    ok({
      address: "  12 Rizal St,   Cebu City ",
      contactNumber: "0917 123 4567",
      contactEmail: " Owner@Example.COM ",
      operatingHours: "Mon–Sat, 8am–6pm",
    }),
    {
      address: "12 Rizal St, Cebu City",
      contact_number: "0917 123 4567",
      email: "owner@example.com",
      operating_hours: "Mon–Sat, 8am–6pm",
    }
  );
});

test("empty fields are stored as null, so nothing blank is ever displayed", () => {
  assert.deepEqual(ok({}), { address: null, contact_number: null, email: null, operating_hours: null });
  assert.deepEqual(ok({ address: "   ", contactNumber: "", contactEmail: null, operatingHours: undefined }), {
    address: null,
    contact_number: null,
    email: null,
    operating_hours: null,
  });
});

test("non-text input is treated as empty, not as a crash", () => {
  assert.deepEqual(ok({ address: 5, contactNumber: {}, contactEmail: [], operatingHours: true }), {
    address: null,
    contact_number: null,
    email: null,
    operating_hours: null,
  });
});

test("phone numbers: the usual ways of writing one are fine, letters and markup are not", () => {
  for (const good of ["09171234567", "+63 917 123 4567", "(032) 123-4567", "0917.123.4567", "123-4567, 123-8910"]) {
    assert.equal(ok({ contactNumber: good }).contact_number, good);
  }
  for (const bad of ["call me", "<script>", "0917abc", "tel:123"]) {
    assert.match(error({ contactNumber: bad }), /Contact number/);
  }
});

test("email must look like an email, or be empty", () => {
  for (const bad of ["not-an-email", "a@b", "a b@c.com", "@c.com", "a@@c.com"]) {
    assert.match(error({ contactEmail: bad }), /valid contact email/, bad);
  }
  assert.equal(ok({ contactEmail: "a@b.co" }).email, "a@b.co");
});

test("length limits", () => {
  assert.match(error({ address: "x".repeat(CONTACT_LIMITS.address + 1) }), /Address/);
  assert.match(error({ operatingHours: "x".repeat(CONTACT_LIMITS.operatingHours + 1) }), /Office hours/);
  assert.match(error({ contactNumber: "1".repeat(CONTACT_LIMITS.contactNumber + 1) }), /Contact number/);
  assert.match(error({ contactEmail: "a".repeat(CONTACT_LIMITS.email) + "@b.co" }), /too long/);
  assert.equal(ok({ address: "x".repeat(CONTACT_LIMITS.address) }).address?.length, CONTACT_LIMITS.address);
});

test("hasDormContact is true when any one field is set", () => {
  assert.equal(hasDormContact(null), false);
  assert.equal(hasDormContact({ address: null, contact_number: null, email: null, operating_hours: null }), false);
  assert.equal(hasDormContact({ operating_hours: "9-5" }), true);
  assert.equal(hasDormContact({ email: "a@b.co" }), true);
});

test("tel links keep only dialable characters", () => {
  assert.equal(telHref("+63 (917) 123-4567"), "tel:+639171234567");
  assert.equal(telHref("0917 123 4567, ext 2"), "tel:091712345672");
});
