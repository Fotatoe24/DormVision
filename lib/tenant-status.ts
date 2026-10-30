import { createAdminClient } from "@/lib/supabase/admin";

// One account can have several tenants rows over time -- one per dorm
// they've lived in. A moved-out row is kept (billing/payment/maintenance
// history still points at it -- see moveOutTenant), so moving to another
// dorm that also uses DormVision adds a second row instead of replacing
// the first.
//
// "Current tenancy" is therefore: the account's active (or inactive) row if
// it has one, otherwise its most recent moved-out row. The ordering trick
// used here and at every other tenant-side lookup is
//
//   .order("status", { ascending: true })      // enum order: active,
//   .order("created_at", { ascending: false }) // inactive, moved_out
//   .limit(1)
//
// because tenant_status is declared (active, inactive, moved_out), so an
// ascending sort puts any live tenancy ahead of every moved-out one.
export async function getCurrentTenancy(userId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("tenants")
    .select("id, dorm_id, room_id, status, move_out_date")
    .eq("profile_id", userId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

// The single source of truth for "is this person an actual tenant" --
// centralized here so /tenant/layout.tsx (and anything else that needs
// it) doesn't have to re-derive it. Presence of a live public.tenants row
// is the only thing that counts; role='tenant' on the user account alone
// just means "not an owner", not "approved".
//
// Every non-approved state carries `hasPastStays` so the screen can offer
// a way back to the billing from dorms the person has already moved out of.
export type TenantAccessState =
  | { status: "approved" }
  | { status: "moved_out"; moveOutDate: string | null; hasPastStays: boolean }
  | { status: "pending"; requestId: string; hasPastStays: boolean }
  | {
      status: "rejected";
      requestId: string;
      reason: string | null;
      hasPastStays: boolean;
    }
  | { status: "none"; hasPastStays: boolean };

export async function getTenantAccessState(
  userId: string
): Promise<TenantAccessState> {
  const admin = createAdminClient();

  const tenancy = await getCurrentTenancy(userId);

  // 'active' and 'inactive' both still count as approved; 'inactive'
  // isn't wired to anything yet elsewhere in the app, so this doesn't
  // change behavior for it.
  if (tenancy && tenancy.status !== "moved_out") {
    return { status: "approved" };
  }

  // Whatever is left is either a moved-out tenant or someone who has never
  // been one. If the only tenancy is moved-out, past stays exist.
  const hasPastStays = Boolean(tenancy);

  // The most recent request, whichever dorm it was for: a moved-out tenant
  // may have just applied to a different dorm.
  const { data: latestRequest } = await admin
    .from("tenant_registration_requests")
    .select("id, status, rejection_reason")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRequest?.status === "pending") {
    return { status: "pending", requestId: latestRequest.id, hasPastStays };
  }

  if (latestRequest?.status === "rejected") {
    return {
      status: "rejected",
      requestId: latestRequest.id,
      reason: latestRequest.rejection_reason,
      hasPastStays,
    };
  }

  // A moved-out tenancy with no newer pending/rejected request: they've
  // moved out and haven't applied anywhere else yet.
  if (tenancy) {
    return {
      status: "moved_out",
      moveOutDate: tenancy.move_out_date,
      hasPastStays: true,
    };
  }

  // 'cancelled' / 'approved' with no tenants row, or no request at all --
  // treat the same as never having applied; they can submit a fresh request.
  return { status: "none", hasPastStays: false };
}
