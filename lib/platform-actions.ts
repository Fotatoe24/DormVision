"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import { recordAudit, type AuditEntry } from "@/lib/audit";
import { revokeUserSessions } from "@/lib/session-store";
import { clearLoginAttempts } from "@/lib/login-lockout";
import { clientIpFrom } from "@/lib/rate-limit";
import { friendlyError } from "@/lib/errors";
import { generateResetToken } from "@/lib/reset-token";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { getSiteOrigin } from "@/lib/site-origin";
import { notifyOwnersDormDecision } from "@/lib/notifications";

// ============================================================
// PLATFORM ADMIN ACTIONS
//
// Every action: (1) requires the platform admin, (2) does ONE bounded thing,
// (3) writes an audit_log entry. Nothing here reads or changes a dorm's money,
// tenants, bills, payments or proofs, and nothing signs in as another user.
// ============================================================

const REASON_MAX = 300;

function reasonFrom(formData: FormData, { required }: { required: boolean }) {
  const reason = String(formData.get("reason") ?? "").trim().slice(0, REASON_MAX);
  return { reason: reason || null, missing: required && !reason };
}

function back(path: string, kind: "saved" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

async function audit(
  admin: ReturnType<typeof createAdminClient>,
  actor: { id: string; email: string },
  entry: Omit<AuditEntry, "actor" | "ip">
) {
  const ip = clientIpFrom(await headers());
  const written = await recordAudit(admin, { ...entry, actor, ip });
  // The action has already happened; make a missing record impossible to miss.
  if (!written) console.error("AUDIT ENTRY NOT WRITTEN for", entry.action, entry.targetId);
}

async function queueMail(send: (origin: string) => Promise<void>) {
  const origin = await getSiteOrigin();
  after(() => send(origin));
}

// ---------- Dormitories ----------

async function loadDorm(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin
    .from("dormitories")
    .select("id, name, suspended_at, approved_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// Ends every sign-in of the dorm's owner and tenants.
async function signOutDorm(admin: ReturnType<typeof createAdminClient>, dormId: string) {
  const { data: people } = await admin.from("users").select("id").eq("dorm_id", dormId);
  const ids = (people ?? []).map((p) => p.id);

  if (ids.length > 0) {
    const { error } = await admin.from("user_sessions").delete().in("user_id", ids);
    if (error && error.code !== "PGRST205" && error.code !== "42P01") {
      console.error("Could not end the dorm's sessions:", error);
    }
  }

  return ids.length;
}

export async function suspendDorm(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const dormId = String(formData.get("dormId") ?? "");
  const page = `/platform/dorms/${dormId}`;
  const { reason, missing } = reasonFrom(formData, { required: true });

  if (missing) back(page, "error", "Give a reason. It's recorded in the audit log and sent to the owner.");

  const admin = createAdminClient();
  const dorm = await loadDorm(admin, dormId);
  if (!dorm) back("/platform/dorms", "error", "Dormitory not found.");
  if (dorm.suspended_at) back(page, "error", "This dormitory is already suspended.");

  const { error } = await admin
    .from("dormitories")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: reason })
    .eq("id", dormId);
  if (error) back(page, "error", friendlyError(error));

  const signedOut = await signOutDorm(admin, dormId);

  await audit(admin, actor, {
    action: "dorm.suspend",
    targetType: "dormitory",
    targetId: dormId,
    targetLabel: dorm.name,
    reason,
    details: { peopleSignedOut: signedOut },
  });
  await queueMail((origin) => notifyOwnersDormDecision(origin, dormId, "suspended", reason));

  revalidatePath("/platform", "layout");
  back(page, "saved", `Suspended. ${signedOut} ${signedOut === 1 ? "person was" : "people were"} signed out.`);
}

export async function reactivateDorm(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const dormId = String(formData.get("dormId") ?? "");
  const page = `/platform/dorms/${dormId}`;

  const admin = createAdminClient();
  const dorm = await loadDorm(admin, dormId);
  if (!dorm) back("/platform/dorms", "error", "Dormitory not found.");
  if (!dorm.suspended_at) back(page, "error", "This dormitory isn't suspended.");

  const { error } = await admin
    .from("dormitories")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", dormId);
  if (error) back(page, "error", friendlyError(error));

  await audit(admin, actor, {
    action: "dorm.reactivate",
    targetType: "dormitory",
    targetId: dormId,
    targetLabel: dorm.name,
  });
  await queueMail((origin) => notifyOwnersDormDecision(origin, dormId, "reactivated"));

  revalidatePath("/platform", "layout");
  back(page, "saved", "Reactivated. The owner and tenants can sign in again.");
}

export async function approveDorm(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const dormId = String(formData.get("dormId") ?? "");
  const page = `/platform/dorms/${dormId}`;

  const admin = createAdminClient();
  const dorm = await loadDorm(admin, dormId);
  if (!dorm) back("/platform/dorms", "error", "Dormitory not found.");
  if (dorm.approved_at) back(page, "error", "This dormitory is already approved.");

  const { error } = await admin
    .from("dormitories")
    .update({ approved_at: new Date().toISOString(), suspended_at: null, suspended_reason: null })
    .eq("id", dormId);
  if (error) back(page, "error", friendlyError(error));

  await audit(admin, actor, {
    action: "dorm.approve",
    targetType: "dormitory",
    targetId: dormId,
    targetLabel: dorm.name,
  });
  await queueMail((origin) => notifyOwnersDormDecision(origin, dormId, "approved"));

  revalidatePath("/platform", "layout");
  back(page, "saved", "Approved. The owner has been emailed and can sign in.");
}

// Declining a dormitory that was waiting for approval. It stays blocked (as
// suspended, with the reason) rather than being deleted, so the decision is on
// record and the owner's account isn't silently orphaned.
export async function rejectDorm(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const dormId = String(formData.get("dormId") ?? "");
  const page = `/platform/dorms/${dormId}`;
  const { reason, missing } = reasonFrom(formData, { required: true });

  if (missing) back(page, "error", "Give a reason. It's recorded in the audit log and sent to the owner.");

  const admin = createAdminClient();
  const dorm = await loadDorm(admin, dormId);
  if (!dorm) back("/platform/dorms", "error", "Dormitory not found.");
  if (dorm.approved_at) back(page, "error", "This dormitory is already approved. Suspend it instead.");

  const { error } = await admin
    .from("dormitories")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: `Not approved: ${reason}` })
    .eq("id", dormId);
  if (error) back(page, "error", friendlyError(error));

  await signOutDorm(admin, dormId);

  await audit(admin, actor, {
    action: "dorm.reject",
    targetType: "dormitory",
    targetId: dormId,
    targetLabel: dorm.name,
    reason,
  });
  await queueMail((origin) => notifyOwnersDormDecision(origin, dormId, "rejected", reason));

  revalidatePath("/platform", "layout");
  back(page, "saved", "Rejected. The owner has been emailed.");
}

// ---------- Accounts ----------

// Platform-admin accounts are never touched from the UI (no self-lockout, no
// admin disabling another admin); owners and tenants only.
async function loadAccount(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin
    .from("users")
    .select("id, email, full_name, role, disabled_at")
    .eq("id", id)
    .maybeSingle();

  return data && data.role !== "platform_admin" ? data : null;
}

export async function disableAccount(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "");
  const page = `/platform/accounts?q=${encodeURIComponent(String(formData.get("q") ?? ""))}`;
  const { reason, missing } = reasonFrom(formData, { required: true });

  if (missing) back(page, "error", "Give a reason. It's recorded in the audit log.");

  const admin = createAdminClient();
  const account = await loadAccount(admin, userId);
  if (!account) back(page, "error", "Account not found.");
  if (account.disabled_at) back(page, "error", "That account is already disabled.");

  const { error } = await admin
    .from("users")
    .update({ disabled_at: new Date().toISOString(), disabled_reason: reason })
    .eq("id", userId);
  if (error) back(page, "error", friendlyError(error));

  await revokeUserSessions(admin, userId);

  await audit(admin, actor, {
    action: "account.disable",
    targetType: "user",
    targetId: userId,
    targetLabel: account.email,
    reason,
    details: { role: account.role },
  });

  revalidatePath("/platform/accounts");
  back(page, "saved", `Disabled ${account.email} and signed them out.`);
}

export async function enableAccount(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "");
  const page = `/platform/accounts?q=${encodeURIComponent(String(formData.get("q") ?? ""))}`;

  const admin = createAdminClient();
  const account = await loadAccount(admin, userId);
  if (!account) back(page, "error", "Account not found.");
  if (!account.disabled_at) back(page, "error", "That account isn't disabled.");

  const { error } = await admin
    .from("users")
    .update({ disabled_at: null, disabled_reason: null })
    .eq("id", userId);
  if (error) back(page, "error", friendlyError(error));

  await audit(admin, actor, {
    action: "account.enable",
    targetType: "user",
    targetId: userId,
    targetLabel: account.email,
  });

  revalidatePath("/platform/accounts");
  back(page, "saved", `Enabled ${account.email}.`);
}

export async function signOutEverywhere(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "");
  const page = `/platform/accounts?q=${encodeURIComponent(String(formData.get("q") ?? ""))}`;

  const admin = createAdminClient();
  const account = await loadAccount(admin, userId);
  if (!account) back(page, "error", "Account not found.");

  await revokeUserSessions(admin, userId);

  await audit(admin, actor, {
    action: "account.sign_out_everywhere",
    targetType: "user",
    targetId: userId,
    targetLabel: account.email,
  });

  back(page, "saved", `${account.email} was signed out on every device.`);
}

export async function clearLockout(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "");
  const page = `/platform/accounts?q=${encodeURIComponent(String(formData.get("q") ?? ""))}`;

  const admin = createAdminClient();
  const account = await loadAccount(admin, userId);
  if (!account) back(page, "error", "Account not found.");

  await clearLoginAttempts(admin, account.email);

  await audit(admin, actor, {
    action: "account.clear_lockout",
    targetType: "user",
    targetId: userId,
    targetLabel: account.email,
  });

  back(page, "saved", `Cleared the sign-in lockout for ${account.email}.`);
}

// Emails the person a normal password-reset link. The admin never sees or sets
// anyone's password; only the account's own email inbox can use the link.
export async function sendResetLink(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "");
  const page = `/platform/accounts?q=${encodeURIComponent(String(formData.get("q") ?? ""))}`;

  const admin = createAdminClient();
  const account = await loadAccount(admin, userId);
  if (!account) back(page, "error", "Account not found.");

  const { token, hash } = generateResetToken();
  const { error } = await admin
    .from("users")
    .update({
      reset_token: hash,
      reset_token_expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .eq("id", userId);
  if (error) back(page, "error", friendlyError(error));

  const origin = await getSiteOrigin();
  after(() =>
    sendPasswordResetEmail(account.email, account.full_name, `${origin}/reset-password?token=${token}`).catch(
      () => {}
    )
  );

  await audit(admin, actor, {
    action: "account.send_reset_link",
    targetType: "user",
    targetId: userId,
    targetLabel: account.email,
  });

  back(page, "saved", `A password-reset link is on its way to ${account.email}.`);
}

// ---------- Settings ----------

export async function setApprovalRequirement(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const page = "/platform/settings";
  const require = formData.get("require") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .update({
      require_owner_approval: require,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq("id", true);
  if (error) back(page, "error", friendlyError(error));

  await audit(admin, actor, {
    action: "settings.require_owner_approval",
    targetType: "platform_settings",
    details: { requireOwnerApproval: require },
  });

  revalidatePath("/platform/settings");
  back(
    page,
    "saved",
    require
      ? "New dormitories now wait for your approval."
      : "New dormitories are approved automatically."
  );
}
