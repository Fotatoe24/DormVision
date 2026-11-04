import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  validatePassword,
} from "@/lib/password-policy";

test("the rule is 8 characters and the hint says so", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(PASSWORD_HINT, /8/);
});

test("rejects anything under 8 characters, accepts exactly 8", () => {
  assert.match(validatePassword("tulip-1") ?? "", /at least 8/);
  assert.equal(validatePassword("tulip-12"), null);
});

test("rejects the passwords everyone tries first, whatever the capitalisation", () => {
  for (const bad of ["password", "Password123", "QWERTY123", "12345678", "iloveyou", "DormVision", "admin123"]) {
    assert.match(validatePassword(bad) ?? "", /too common/, bad);
  }
});

test("rejects one repeated character", () => {
  assert.match(validatePassword("aaaaaaaaaa") ?? "", /repeated/);
  assert.match(validatePassword("0000000000") ?? "", /repeated/);
  assert.equal(validatePassword("abababab"), null);
});

test("bcrypt only reads 72 BYTES, so longer is refused (not silently cut off)", () => {
  assert.equal(validatePassword("ab".repeat(36)), null); // exactly 72 bytes
  assert.match(validatePassword("ab".repeat(36) + "c") ?? "", /too long/); // 73
});

test("the limit counts bytes, not characters", () => {
  // 37 two-byte characters is only 37 characters but 74 bytes.
  assert.match(validatePassword("éà".repeat(18) + "é") ?? "", /too long/);
  assert.equal(validatePassword("éà".repeat(18)), null); // 36 characters = exactly 72 bytes
});

test("can't be the email or the part before the @", () => {
  const ctx = { email: "Maria.Santos@school.edu" };
  assert.match(validatePassword("maria.santos@school.edu", ctx) ?? "", /same as your email/);
  assert.match(validatePassword("MARIA.SANTOS", ctx) ?? "", /same as your email/);
  assert.equal(validatePassword("maria.santos-2026", ctx), null);
});

test("a normal passphrase is fine", () => {
  assert.equal(validatePassword("correct horse battery staple"), null);
  assert.equal(validatePassword("Tulip#Garden42"), null);
});
