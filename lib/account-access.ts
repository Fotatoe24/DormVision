import type { createAdminClient } from "@/lib/supabase/admin";

// Who is allowed to sign in, decided in one place (migration 0028 adds the
// fields it reads). An account can be turned off on its own, and a dormitory can
// be suspended or still waiting for approval -- which blocks its owner and every
// tenant in it. The platform admin has no dorm, so only the first rule applies.

type Admin = ReturnType<typeof createAdminClient>;

export type AccessBlock = "disabled" | "suspended" | "pending";

export type AccessAccount = {
  disabled_at?: string | null;
  disabled_reason?: string | null;
};

export type AccessDorm = {
  suspended_at?: string | null;
  suspended_reason?: string | null;
  approved_at?: string | null;
} | null;

export function accessBlock(
  account: AccessAccount,
  dorm: AccessDorm
): AccessBlock | null {
  if (account.disabled_at) return "disabled";
  if (dorm?.suspended_at) return "suspended";
  // `undefined` means the column isn't there yet (migration 0028 not run), which
  // must not lock anyone out; only an explicit null is "pending".
  if (dorm && dorm.approved_at === null) return "pending";
  return null;
}

export function accessBlockMessage(block: AccessBlock) {
  switch (block) {
    case "disabled":
      return "This account has been disabled. Contact the DormVision administrator if you think this is a mistake.";
    case "suspended":
      return "This dormitory has been suspended. Contact the DormVision administrator if you think this is a mistake.";
    case "pending":
      return "This dormitory is awaiting approval. You'll get an email as soon as it's reviewed.";
  }
}

// "The column / table isn't there yet" -- 0028 hasn't been run.
function isMissingSchema(error: { code?: string } | null) {
  return (
    error?.code === "42703" || // undefined_column
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    error?.code === "42P01"
  );
}

// Can new people join this dorm right now? Same fail-open rule as below.
export async function findDormBlock(
  admin: Admin,
  dormId: string
): Promise<AccessBlock | null> {
  const { data, error } = await admin
    .from("dormitories")
    .select("suspended_at, approved_at")
    .eq("id", dormId)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }

  return data ? accessBlock({}, data) : null;
}

// Looks the account and its dorm up fresh from the database. Fails OPEN when the
// migration hasn't been applied (so deploying the code first locks nobody out),
// but CLOSED on any other error: if we can't tell, we don't sign someone in.
export async function findAccessBlock(
  admin: Admin,
  userId: string,
  dormId: string | null
): Promise<AccessBlock | null> {
  const { data: account, error } = await admin
    .from("users")
    .select("disabled_at, disabled_reason")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  if (!account) return "disabled";

  let dorm: AccessDorm = null;

  if (dormId) {
    const { data, error: dormError } = await admin
      .from("dormitories")
      .select("suspended_at, suspended_reason, approved_at")
      .eq("id", dormId)
      .maybeSingle();

    if (dormError) {
      if (isMissingSchema(dormError)) return null;
      throw dormError;
    }
    dorm = data;
  }

  return accessBlock(account, dorm);
}
