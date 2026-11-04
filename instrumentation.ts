// Runs once when the server starts (Next's instrumentation hook).
//
// DormVision's dorms are in the Philippines (Asia/Manila, UTC+8, no daylight
// saving), but the server -- Vercel -- runs in UTC. Everything that asks "what
// day is it?" (the billing month, due dates, overdue counts, a payment's
// display date) goes through Date's local-time functions, so between midnight
// and 8 AM Manila time the server believed it was still the previous day:
// bills for the wrong month on the 1st, overdue off by a day, payments dated
// yesterday.
//
// Setting the process time zone here makes Date's "local" time Manila time for
// the whole server, in one place, instead of patching every call site.
// (Node re-reads TZ when it is assigned at runtime -- covered by
// tests/time.test.ts.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  process.env.TZ = "Asia/Manila";
}
