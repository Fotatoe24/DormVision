import { createAdminClient } from "@/lib/supabase/admin";

// The single source of truth for "is this person an actual tenant" --
// centralized here so /tenant/layout.tsx (and anything else that needs
// it) doesn't have to re-derive it. Presence of a public.tenants row is
// the only thing that counts; role='tenant' on the user account alone
// just means "not an owner", not "approved".
export type TenantAccessState =
  | { status: "approved" }
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
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();

  if (tenant) {
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
