import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
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

// Same { user, profile } shape the rest of the app already expects from
// the old Supabase-Auth-backed version of this function, so no call site
// elsewhere needs to change — only what's inside changed.
export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

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
  };
}
