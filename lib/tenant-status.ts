import { createAdminClient } from "@/lib/supabase/admin";

// The single source of truth for "is this person an actual tenant" --
// centralized here so /tenant/layout.tsx (and anything else that needs
// it) doesn't have to re-derive it. Presence of a public.tenants row is
// the only thing that counts; role='tenant' on the user account alone
// just means "not an owner", not "approved".
export type TenantAccessState =
  | { status: "approved" }
  | { status: "moved_out"; moveOutDate: string | null }
  | { status: "pending"; requestId: string }
  | { status: "rejected"; requestId: string; reason: string | null }
  | { status: "none" };

export async function getTenantAccessState(
  userId: string,
  dormId: string | null
): Promise<TenantAccessState> {
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status, move_out_date")
    .eq("profile_id", userId)
    .maybeSingle();

  if (tenant) {
    // A moved-out tenant's row is kept (billing/payment/maintenance
    // history still points at it -- see moveOutTenant), but it no
    // longer grants access to the tenant dashboard. 'active' and
    // 'inactive' both still count as approved; 'inactive' isn't wired
    // to anything yet elsewhere in the app, so this doesn't change
    // behavior for it.
    if (tenant.status === "moved_out") {
      return { status: "moved_out", moveOutDate: tenant.move_out_date };
    }

    return { status: "approved" };
  }

  if (!dormId) {
    return { status: "none" };
  }

  const { data: latestRequest } = await admin
    .from("tenant_registration_requests")
    .select("id, status, rejection_reason")
    .eq("user_id", userId)
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRequest) {
    return { status: "none" };
  }

  if (latestRequest.status === "pending") {
    return { status: "pending", requestId: latestRequest.id };
  }

  if (latestRequest.status === "rejected") {
    return {
      status: "rejected",
      requestId: latestRequest.id,
      reason: latestRequest.rejection_reason,
    };
  }

  // 'cancelled' (or any other terminal non-pending state) -- treat the
  // same as never having applied; they can submit a fresh request.
  return { status: "none" };
}
