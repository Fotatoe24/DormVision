import { SignJWT, jwtVerify } from "jose";

// Split out from lib/auth.ts deliberately: proxy.ts imports this file
// directly, so it stays lightweight and only touches `jose` — never
// bcryptjs or the rest of the auth module.

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error(
    "Missing JWT_SECRET. Set a long random value (e.g. `openssl rand -base64 32`) " +
      "in your environment — there is no insecure fallback here on purpose."
  );
}

const JWT_SECRET = new TextEncoder().encode(secret);

export interface SessionPayload {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  dormId: string | null;
  // Id of the server-side session this cookie belongs to (user_sessions,
  // migration 0022). Absent on cookies from before that existed.
  sid?: string;
}

export type UserRole = "owner" | "tenant" | "platform_admin";

export const AUTH_COOKIE_NAME = "dormvision-token";

// How long a sign-in lasts. Everyone gets a week except the platform admin, who
// can act on every dormitory and so gets a working day: a stolen or forgotten
// admin session expires on its own.
export function sessionLifetimeSeconds(role: UserRole) {
  return role === "platform_admin" ? 8 * 60 * 60 : 7 * 24 * 60 * 60;
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetimeSeconds(payload.role)}s`)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
