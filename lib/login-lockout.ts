import { createAdminClient } from "@/lib/supabase/admin";

// Thin wrappers around the login_attempt_* database functions (migration
// 0021). The rules themselves -- 3 wrong tries, 5-minute lock -- live in SQL
// so they are enforced atomically across every serverless instance; this file
// only calls them and words the results for people.

type Admin = ReturnType<typeof createAdminClient>;

export type LoginGate = {
  locked: boolean;
  retryAfterSeconds: number;
  // The lockout check itself failed (not "the migration isn't applied yet").
  failed?: boolean;
};

// Emails are the key; keep the key a sane size so nobody can stuff the table
// with giant strings.
const key = (email: string) => email.slice(0, 254);

// A function that doesn't exist yet means migration 0021 hasn't been run.
// Locking everyone out of the app until it is would be worse than skipping
// the lockout for a moment, so that one case is allowed through (and logged
// loudly). Any other failure is treated as a real error.
function isMissingFunction(error: { code?: string } | null) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

// Call BEFORE checking the password. The attempt is counted here, atomically,
// so parallel guesses can't all squeeze past the limit.
export async function beginLoginAttempt(
  admin: Admin,
  email: string
): Promise<LoginGate> {
  const { data, error } = await admin.rpc("login_attempt_begin", {
    p_email: key(email),
  });

  if (error) {
    if (isMissingFunction(error)) {
      console.error(
        "Login lockout is NOT active: run supabase/migrations/0021_login_lockout.sql.",
        error
      );
      return { locked: false, retryAfterSeconds: 0 };
    }
    console.error("Login lockout check failed:", error);
    return { locked: false, retryAfterSeconds: 0, failed: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    locked: Boolean(row?.locked),
    retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
  };
}

// The password (or the email) was wrong.
export async function recordFailedLogin(admin: Admin, email: string) {
  const { data, error } = await admin.rpc("login_attempt_failed", {
    p_email: key(email),
  });

  if (error) {
    if (!isMissingFunction(error)) console.error("Could not record failed login:", error);
    return { locked: false, retryAfterSeconds: 0, attemptsLeft: null as number | null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    locked: Boolean(row?.locked),
    retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
    attemptsLeft:
      row?.attempts_left === undefined ? null : Number(row.attempts_left),
  };
}

// A successful sign-in forgets earlier failures.
export async function clearLoginAttempts(admin: Admin, email: string) {
  const { error } = await admin.rpc("login_attempt_clear", {
    p_email: key(email),
  });
  if (error && !isMissingFunction(error)) {
    console.error("Could not clear login attempts:", error);
  }
}

// "5 minutes", "1 minute", "40 seconds" -- always rounded UP, so we never
// tell someone to retry a moment before the lock really ends.
export function describeWait(seconds: number) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const minutes = Math.ceil(s / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function lockedMessage(retryAfterSeconds: number) {
  return `Too many failed attempts. Please try again in ${describeWait(
    retryAfterSeconds
  )}.`;
}

export function invalidCredentialsMessage(attemptsLeft: number | null) {
  if (attemptsLeft === null) return "Invalid email or password.";
  return `Invalid email or password. ${attemptsLeft} ${
    attemptsLeft === 1 ? "try" : "tries"
  } left before a 5-minute lock.`;
}
