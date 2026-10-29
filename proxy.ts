import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/jwt";

// Protect the /admin, /tenant, and /profile route groups — redirect
// anyone without a valid session token to the login screen at the app
// root. This is Next 16's `proxy` convention (formerly `middleware`),
// which runs on the Node.js runtime; session verification goes through
// the lightweight jose-only helpers in lib/jwt.ts.
const protectedPrefixes = ["/admin", "/tenant", "/profile"];

export async function proxy(request: NextRequest) {
  const isProtected = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static files)
     * - favicon.ico
     * - image/font files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
