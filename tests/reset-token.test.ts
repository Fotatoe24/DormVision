import test from "node:test";
import assert from "node:assert/strict";
import { generateResetToken, hashResetToken } from "@/lib/reset-token";

test("a token is 256 random bits and its stored value is a different SHA-256 hash", () => {
  const { token, hash } = generateResetToken();

  assert.match(token, /^[0-9a-f]{64}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token); // the database never holds what the link carries
});

test("the link's token hashes back to exactly what was stored", () => {
  const { token, hash } = generateResetToken();

  assert.equal(hashResetToken(token), hash);
  assert.equal(hashResetToken(token), hashResetToken(token)); // deterministic
});

test("tokens are unique, and a wrong token does not match", () => {
  const a = generateResetToken();
  const b = generateResetToken();

  assert.notEqual(a.token, b.token);
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(hashResetToken(a.token), b.hash);
});

test("the hash alone can't be used as a token (a leaked users table is useless)", () => {
  const { hash } = generateResetToken();

  // Submitting the stored value would be hashed AGAIN and no longer match.
  assert.notEqual(hashResetToken(hash), hash);
});
