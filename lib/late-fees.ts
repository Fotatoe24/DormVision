import { createAdminClient } from "@/lib/supabase/admin";

// Charges the dorm's late payment fee (Settings) on every rent bill that has
// gone past due date + grace period, once per bill -- see migration 0029.
//
// There is no scheduler, so this runs when someone looks at the money: the
// pages that show balances call it just before reading their bills. It is one
// idempotent UPDATE in the database, so calling it on every visit is safe and
// cheap, and whichever of the owner or the tenant opens the app first after a
// bill goes late triggers it.
//
// It must never break the page: if the function isn't there yet (migration not
// run) or the call fails, the page simply shows the bills as they are.
export async function applyLateFees(dormId: string | null | undefined) {
  if (!dormId) return 0;

  const { data, error } = await createAdminClient().rpc("charge_late_fees", {
    p_dorm_id: dormId,
  });

  if (error) {
    // PGRST202 / 42883: migration 0029 hasn't been run yet.
    if (error.code !== "PGRST202" && error.code !== "42883") {
      console.error("Could not apply late fees:", error);
    }
    return 0;
  }

  return Number(data ?? 0);
}
