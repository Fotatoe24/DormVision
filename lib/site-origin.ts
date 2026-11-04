import { headers } from "next/headers";

// Base URL for the current request. Falls back to the request's own host so
// this works in dev/preview/prod without extra env config, but honors
// NEXT_PUBLIC_SITE_URL if set (useful when multiple hosts serve the same
// deployment and links should always point at one).
export async function getSiteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";

  return `${protocol}://${host}`;
}
