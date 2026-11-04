import crypto from "node:crypto";

// Password-reset tokens.
//
// The emailed link carries the token itself; the database keeps only its
// SHA-256 hash (users.reset_token). A token is random 256-bit, so a plain
// unsalted hash is enough -- there is nothing to brute-force -- and it means a
// leaked copy of the users table can't be used to reset anyone's password.
//
// (Tokens issued before this change were stored as-is and are simply no longer
// recognised; they were only ever valid for an hour.)

export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashResetToken(token) };
}
