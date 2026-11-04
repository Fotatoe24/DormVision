import type { createAdminClient } from "@/lib/supabase/admin";

// General-purpose rate limiting backed by Postgres (migration 0024's
// rate_limit_hit), because a counter kept in memory would be reset -- or split
// across instances -- by every serverless invocation. Used for the things the
// sign-in lockout doesn't cover: password-reset requests, Dorm ID lookups and
// sign-ups.

type Admin = ReturnType<typeof createAdminClient>;

export type RateLimit = { allowed: boolean; retryAfterSeconds: number };

// Rate limiting is a safety net, not a gate the whole app depends on: if the
// check itself can't run (migration 0024 not applied yet, or a database blip)
// the request is allowed and the problem is logged.
export async function checkRateLimit(
  admin: Admin,
  key: string,
  max: number,
  windowSeconds: number
): Promise<RateLimit> {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: key.slice(0, 200),
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    const missing = error.code === "PGRST202" || error.code === "42883";
    console.error(
      missing
        ? "Rate limiting is NOT active: run supabase/migrations/0024_rate_limits.sql."
        : "Rate limit check failed:",
      error
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed !== false,
    retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
  };
}

// The visitor's IP, for keying limits. On Vercel the platform sets
// x-forwarded-for itself, so the first entry is the real client; anywhere else
// it can be spoofed, which only lets someone dodge a limit, never reach more.
export function clientIpFrom(headers: { get(name: string): string | null }) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim() || "";

  return candidate && candidate.length <= 64 ? candidate : "unknown";
}
