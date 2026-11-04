// One password rule for the whole app (sign-up, reset, change). Pure and free
// of server imports so the forms in the browser can show the same rule the
// server enforces.

export const MIN_PASSWORD_LENGTH = 8;

// bcrypt only ever uses the first 72 BYTES of a password and silently ignores
// the rest, so a longer one is no stronger -- and two passwords that differ
// only after byte 72 would be accepted as each other. Better to say so.
export const MAX_PASSWORD_BYTES = 72;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

// The passwords that show up first in every leaked-password list, limited to
// ones that clear the length rule (shorter ones are already rejected).
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234",
  "passw0rd", "p@ssw0rd", "p@ssword", "12345678", "123456789", "1234567890",
  "12341234", "11111111", "00000000", "87654321", "123123123", "12121212",
  "qwerty123", "qwertyui", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "asdfghjk",
  "asdf1234", "abc12345", "abcd1234", "abcdefgh", "iloveyou", "iloveyou1",
  "sunshine", "princess", "football", "baseball", "superman", "trustno1",
  "welcome1", "welcome123", "letmein1", "letmein123", "admin123", "administrator",
  "changeme", "changeme1", "dormvision", "dormitory", "dormitory1", "boarding",
  "monkey123", "dragon123", "master123", "login123", "pass1234", "test1234",
]);

// Returns the reason a password is not acceptable, or null if it is fine.
export function validatePassword(
  password: string,
  context: { email?: string | null } = {}
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "Password is too long. Please use 72 characters or fewer.";
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    return "That password is too common. Please choose something harder to guess.";
  }

  // "aaaaaaaa", "11111111"
  if (new Set(password).size === 1) {
    return "Password can't be a single repeated character.";
  }

  const email = context.email?.trim().toLowerCase();
  if (email && (lower === email || lower === email.split("@")[0])) {
    return "Password can't be the same as your email.";
  }

  return null;
}
