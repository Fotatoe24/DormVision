import type { createAdminClient } from "@/lib/supabase/admin";
import type { SessionPayload } from "@/lib/jwt";

// Server-side half of sign-in sessions (migration 0022). The cookie is a signed
// token (lib/jwt.ts) that carries a session id; this file creates, checks and
// ends the matching rows, so a session can really be revoked -- by logging out,
// or by changing/resetting the password.

type Admin = ReturnType<typeof createAdminClient>;
type DbError = { code?: string } | null;

const TABLE = "user_sessions";

// Must match the JWT's own expiry (lib/jwt.ts: "7d").
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// "The table isn't there yet" -- migration 0022 hasn't been run. PostgREST
// reports it as PGRST205, Postgres itself as 42P01.
function isMissingTable(error: DbError | undefined) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

// Records a new sign-in and returns its id, which goes into the cookie.
// Returns null ONLY when the table doesn't exist yet (the app then falls back
// to the old cookie-only behavior instead of locking everyone out).
export async function createSessionRow(
  admin: Admin,
  userId: string
): Promise<string | null> {
  // Housekeeping so expired rows don't pile up (best effort).
  if (Math.random() < 0.02) {
    await admin.from(TABLE).delete().lt("expires_at", new Date().toISOString());
  }

  const { data, error } = await admin
    .from(TABLE)
    .insert({
      user_id: userId,
      expires_at: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      console.error(
        "Server-side sessions are NOT active: run supabase/migrations/0022_user_sessions.sql.",
        error
      );
      return null;
    }
    throw error;
  }

  return data.id as string;
}

// Is this (already signature-verified) cookie still a live session?
export async function isSessionActive(
  admin: Admin,
  payload: SessionPayload
): Promise<boolean> {
  if (payload.sid) {
    const { data, error } = await admin
      .from(TABLE)
      .select("id, user_id, expires_at")
      .eq("id", payload.sid)
      .maybeSingle();

    if (error) {
      // Table not rolled out: nothing to check against, keep old behavior.
      if (isMissingTable(error)) return true;
      console.error("Could not check session:", error);
      return false;
    }

    return (
      Boolean(data) &&
      data!.user_id === payload.id &&
      new Date(data!.expires_at) > new Date()
    );
  }

  // A cookie from before this feature (no session id). Once the table exists
  // those are retired -- that's the point of the change -- so they are only
  // accepted while the table doesn't exist.
  const { error } = await admin.from(TABLE).select("id").limit(1);
  return isMissingTable(error);
}

// Logout: end exactly this session.
export async function revokeSession(admin: Admin, sid: string) {
  const { error } = await admin.from(TABLE).delete().eq("id", sid);
  if (error && !isMissingTable(error)) {
    console.error("Could not end session:", error);
  }
}

// Password changed / reset: end the user's sessions. On a password CHANGE the
// current one is kept (`exceptSid`) so the person isn't thrown out of the very
// page they just used; on a RESET everything goes.
export async function revokeUserSessions(
  admin: Admin,
  userId: string,
  exceptSid?: string | null
) {
  let query = admin.from(TABLE).delete().eq("user_id", userId);
  if (exceptSid) query = query.neq("id", exceptSid);

  const { error } = await query;
  if (error && !isMissingTable(error)) {
    console.error("Could not end the user's sessions:", error);
  }
}
