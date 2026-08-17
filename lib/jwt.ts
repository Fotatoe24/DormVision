import { SignJWT, jwtVerify } from "jose";

// Split out from lib/auth.ts deliberately: this file must stay
// Edge-runtime-safe (middleware.ts imports it directly), so it only
// touches `jose` — never bcryptjs or anything Node-specific.

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
  role: "owner" | "tenant";
  dormId: string | null;
}

export const AUTH_COOKIE_NAME = "dormvision-token";

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
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
