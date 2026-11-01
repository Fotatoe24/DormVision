import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionRow, isSessionActive } from "@/lib/session-store";
import {
  createSessionToken,
  verifySessionToken,
  AUTH_COOKIE_NAME,
  type SessionPayload,
} from "@/lib/jwt";

export { createSessionToken, AUTH_COOKIE_NAME, type SessionPayload };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Signs someone in: records a server-side session and returns the signed
// cookie value that carries its id. The session row is what lets logout and
// password changes actually end a sign-in (see lib/session-store.ts).
export async function issueSession(payload: Omit<SessionPayload, "sid">) {
  const sid = await createSessionRow(createAdminClient(), payload.id);
  return createSessionToken(sid ? { ...payload, sid } : payload);
}

// Same { user, profile } shape the rest of the app already expects from
// the old Supabase-Auth-backed version of this function, so no call site
// elsewhere needs to change — only what's inside changed.
//
// A valid signature is no longer enough: the session must also still exist on
// the server and be unexpired, otherwise logging out or changing a password
// could not end it. Wrapped in React's cache() so the 42 callers across one
// page render (layout + page + helpers) share a single check.
export const getSessionUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  if (!(await isSessionActive(createAdminClient(), payload))) return null;

  return {
    user: {
      id: payload.id,
      email: payload.email,
    },
    profile: {
      role: payload.role,
      full_name: payload.fullName,
      dorm_id: payload.dormId,
    },
    // Needed to end THIS session on logout / keep it on a password change.
    sid: payload.sid ?? null,
  };
});
