"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import crypto from "crypto";
import {
  getSessionUser,
  hashPassword,
  verifyPassword,
  createSessionToken,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPasswordResetEmail } from "@/lib/mailer";

// ============================================================
// AUTHENTICATION
//
// No Supabase Auth session exists anywhere in this app anymore —
// login issues our own JWT (lib/jwt.ts) in an httpOnly cookie, and
// every action below reaches Postgres through the service-role admin
// client instead of the RLS-bound one, since RLS has nothing to key
// off of without auth.uid(). Every query that used to lean on RLS for
// scoping now does it explicitly (.eq("dorm_id", dormId) etc.).
// ============================================================

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, matches the JWT's own expiry

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
}

// Base URL for the current request. Falls back to the request's own
// host so this works in dev/preview/prod without extra env config, but
// honors NEXT_PUBLIC_SITE_URL if set (useful when multiple hosts serve
// the same deployment and links should always point at one).
async function getSiteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";

  return `${protocol}://${host}`;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/?error=" + encodeURIComponent("Enter your email and password."));
  }

  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("id, email, full_name, role, dorm_id, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (!user || !user.password_hash) {
    redirect("/?error=" + encodeURIComponent("Invalid email or password."));
  }

  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    redirect("/?error=" + encodeURIComponent("Invalid email or password."));
  }

  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    dormId: user.dorm_id,
  });

  await setSessionCookie(token);

  redirect(user.role === "owner" ? "/admin" : "/tenant");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);

  redirect("/");
}

// ============================================================
// PASSWORD RESET
//
// Fully custom now — no Supabase recovery links. A random token lives
// on public.users (reset_token / reset_token_expires, see
// supabase/migrations/0004_custom_auth.sql) with a 1-hour expiry, and
// /reset-password reads it from the URL and posts it back as a hidden
// field.
// ============================================================

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    redirect(
      "/forgot-password?error=" + encodeURIComponent("Enter your email.")
    );
  }

  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("id, full_name, email")
    .eq("email", email)
    .maybeSingle();

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await admin
      .from("users")
      .update({ reset_token: token, reset_token_expires: expiresAt })
      .eq("id", user.id);

    if (!tokenError) {
      const origin = await getSiteOrigin();
      const resetLink = `${origin}/reset-password?token=${token}`;

      // Best-effort — a delivery failure shouldn't leak whether the
      // account exists, so it falls through to the same message below.
      await sendPasswordResetEmail(user.email, user.full_name, resetLink).catch(
        () => {}
      );
    }
  }

  // Same message whether or not the email has an account — avoids
  // leaking which addresses are registered.
  redirect(
    "/forgot-password?success=" +
      encodeURIComponent(
        "If an account exists for that email, a password reset link is on its way."
      )
  );
}

export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    redirect(
      "/reset-password?error=" +
        encodeURIComponent("This reset link is invalid or has expired.")
    );
  }

  const tokenQuery = `token=${encodeURIComponent(token)}`;

  if (!password || password.length < 6) {
    redirect(
      `/reset-password?${tokenQuery}&error=` +
        encodeURIComponent("Password must be at least 6 characters.")
    );
  }

  if (password !== confirmPassword) {
    redirect(
      `/reset-password?${tokenQuery}&error=` +
        encodeURIComponent("Passwords don't match.")
    );
  }

  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("id, email, full_name, role, dorm_id, reset_token_expires")
    .eq("reset_token", token)
    .maybeSingle();

  if (
    !user ||
    !user.reset_token_expires ||
    new Date(user.reset_token_expires) < new Date()
  ) {
    redirect(
      "/reset-password?error=" +
        encodeURIComponent("This reset link is invalid or has expired.")
    );
  }

  const passwordHash = await hashPassword(password);

  const { error: updateError } = await admin
    .from("users")
    .update({
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expires: null,
    })
    .eq("id", user.id);

  if (updateError) {
    redirect("/reset-password?error=" + encodeURIComponent(updateError.message));
  }

  const sessionToken = await createSessionToken({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    dormId: user.dorm_id,
  });

  await setSessionCookie(sessionToken);

  redirect(
    "/?success=" + encodeURIComponent("Password updated. You're signed in.")
  );
}

// ============================================================
// OWNER SIGN-UP
// ============================================================

export async function signUpOwner(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const dormName = String(formData.get("dormName") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !dormName || !email || !password) {
    redirect("/signup?error=" + encodeURIComponent("Fill in every field."));
  }

  if (password.length < 6) {
    redirect(
      "/signup?error=" +
        encodeURIComponent("Password must be at least 6 characters.")
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    redirect(
      "/signup?error=" + encodeURIComponent("An account with that email already exists.")
    );
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  // Creates the users row, the dormitories row, and backfills
  // users.dorm_id all inside one Postgres transaction — see
  // supabase/migrations/0003_create_owner_account_rpc.sql and
  // 0005_owner_account_rpc_password_hash.sql. Either all three writes
  // land or none do.
  const { data: rpcResult, error: createError } = await admin.rpc(
    "create_owner_account",
    {
      p_user_id: userId,
      p_full_name: fullName,
      p_email: email,
      p_dorm_name: dormName,
      p_password_hash: passwordHash,
    }
  );

  if (createError || !rpcResult || rpcResult.length === 0) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(
          "Could not create owner account: " +
            (createError?.message ?? "unknown error")
        )
    );
  }

  const dormId = rpcResult[0].out_dorm_id as string;

  const token = await createSessionToken({
    id: userId,
    email,
    fullName,
    role: "owner",
    dormId,
  });

  await setSessionCookie(token);

  redirect("/admin");
}

// ============================================================
// TENANT SIGN-UP
// ============================================================

export async function signUpTenant(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const dormCode = String(formData.get("dormCode") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !dormCode || !email || !password) {
    redirect(
      "/signup/tenant?error=" + encodeURIComponent("Fill in every field.")
    );
  }

  if (password.length < 6) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent("Password must be at least 6 characters.")
    );
  }

  const admin = createAdminClient();

  const { data: matches, error: lookupError } = await admin.rpc(
    "lookup_dormitory_by_code",
    {
      p_code: dormCode,
    }
  );

  if (lookupError || !matches || matches.length === 0) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "That Dorm ID wasn't found. Check with your dorm owner."
        )
    );
  }

  const dormId = matches[0].id;

  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent("An account with that email already exists.")
    );
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  const { error: userError } = await admin.from("users").insert({
    id: userId,
    role: "tenant",
    full_name: fullName,
    email,
    phone: phone || null,
    dorm_id: dormId,
    password_hash: passwordHash,
  });

  if (userError) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "Could not create tenant profile: " + userError.message
        )
    );
  }

  const { error: tenantError } = await admin.from("tenants").insert({
    profile_id: userId,
    dorm_id: dormId,
    full_name: fullName,
    contact_number: phone || null,
  });

  if (tenantError) {
    await admin.from("users").delete().eq("id", userId);

    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "Could not create tenant record: " + tenantError.message
        )
    );
  }

  const token = await createSessionToken({
    id: userId,
    email,
    fullName,
    role: "tenant",
    dormId,
  });

  await setSessionCookie(token);

  redirect("/tenant");
}

// ============================================================
// TENANT PROFILE
// ============================================================

export async function updateTenantProfile(formData: FormData) {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  const phone = String(formData.get("phone") ?? "").trim();

  const emergencyContactName = String(
    formData.get("emergencyContactName") ?? ""
  ).trim();

  const emergencyContactNumber = String(
    formData.get("emergencyContactNumber") ?? ""
  ).trim();

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({
      phone: phone || null,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_number: emergencyContactNumber || null,
    })
    .eq("id", session.user.id);

  if (error) {
    redirect("/tenant?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/tenant");

  redirect("/tenant?saved=1");
}

// ============================================================
// OWNER AUTHORIZATION
// ============================================================

async function requireOwnerDormId() {
  const session = await getSessionUser();

  if (
    !session ||
    session.profile?.role !== "owner" ||
    !session.profile.dorm_id
  ) {
    redirect("/");
  }

  return session.profile.dorm_id as string;
}

// ============================================================
// ROOM STATUS
// ============================================================

async function syncRoomStatus(
  supabase: ReturnType<typeof createAdminClient>,
  roomId: string,
  dormId: string
) {
  const { data: room } = await supabase
    .from("rooms")
    .select("capacity, status")
    .eq("id", roomId)
    .eq("dorm_id", dormId)
    .single();

  if (!room || room.status === "maintenance") {
    return;
  }

  const { count } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("status", "active");

  const nextStatus = (count ?? 0) >= room.capacity ? "full" : "available";

  await supabase
    .from("rooms")
    .update({ status: nextStatus })
    .eq("id", roomId)
    .eq("dorm_id", dormId);
}

// ============================================================
// ROOM MANAGEMENT
// ============================================================

export async function createRoom(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const roomNumber = String(formData.get("roomNumber") ?? "").trim();

  const capacity = Number(formData.get("capacity"));
  const monthlyRate = Number(formData.get("monthlyRate"));

  if (!roomNumber || !Number.isFinite(capacity) || capacity < 1) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Enter a room number and a capacity of at least 1.")
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("rooms").insert({
    dorm_id: dormId,
    room_number: roomNumber,
    capacity,
    monthly_rate: Number.isFinite(monthlyRate) ? monthlyRate : 0,
  });

  if (error) {
    redirect("/admin/rooms?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function updateRoomStatus(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const roomId = String(formData.get("roomId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!roomId || !["available", "full", "maintenance"].includes(status)) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent("Invalid room update.")
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("rooms")
    .update({ status })
    .eq("id", roomId)
    .eq("dorm_id", dormId)
    .select("id");

  if (error) {
    redirect("/admin/rooms?error=" + encodeURIComponent(error.message));
  }

  if (!data || data.length === 0) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Room not found or access denied.")
    );
  }

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function deleteRoom(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const roomId = String(formData.get("roomId") ?? "");

  if (!roomId) {
    redirect("/admin/rooms");
  }

  const supabase = createAdminClient();

  const { count } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("status", "active");

  if ((count ?? 0) > 0) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Move tenants out of this room before deleting it.")
    );
  }

  const { data, error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", roomId)
    .eq("dorm_id", dormId)
    .select("id");

  if (error) {
    redirect("/admin/rooms?error=" + encodeURIComponent(error.message));
  }

  if (!data || data.length === 0) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Room not found or access denied.")
    );
  }

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function assignTenantToRoom(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const tenantId = String(formData.get("tenantId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");

  if (!tenantId || !roomId) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent("Pick a tenant and a room.")
    );
  }

  const supabase = createAdminClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("capacity")
    .eq("id", roomId)
    .eq("dorm_id", dormId)
    .single();

  if (roomError || !room) {
    redirect("/admin/rooms?error=" + encodeURIComponent("Room not found."));
  }

  const { count } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("status", "active");

  if ((count ?? 0) >= room.capacity) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent("That room is already full.")
    );
  }

  const { data: updatedTenant, error: tenantSyncError } = await supabase
    .from("tenants")
    .update({
      room_id: roomId,
      status: "active",
      move_out_date: null,
    })
    .eq("profile_id", tenantId)
    .eq("dorm_id", dormId)
    .select("id");

  if (tenantSyncError) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent(tenantSyncError.message)
    );
  }

  if (!updatedTenant || updatedTenant.length === 0) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Tenant not found or access denied.")
    );
  }

  await syncRoomStatus(supabase, roomId, dormId);

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function removeTenantFromRoom(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const tenantId = String(formData.get("tenantId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");

  if (!tenantId) {
    redirect("/admin/rooms");
  }

  const supabase = createAdminClient();

  const { data: updatedTenant, error: tenantSyncError } = await supabase
    .from("tenants")
    .update({
      room_id: null,
      status: "inactive",
      move_out_date: new Date().toISOString().slice(0, 10),
    })
    .eq("profile_id", tenantId)
    .eq("dorm_id", dormId)
    .select("id");

  if (tenantSyncError) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent(tenantSyncError.message)
    );
  }

  if (!updatedTenant || updatedTenant.length === 0) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Tenant not found or access denied.")
    );
  }

  if (roomId) {
    await syncRoomStatus(supabase, roomId, dormId);
  }

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

// ============================================================
// BILLING
// ============================================================

export async function generateMonthlyBills() {
  const dormId = await requireOwnerDormId();

  const supabase = createAdminClient();

  const now = new Date();

  // First and last day of the current month
  const year = now.getFullYear();
  const month = now.getMonth();

  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 0);

  const formatDate = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const billingPeriodStart = formatDate(periodStart);
  const billingPeriodEnd = formatDate(periodEnd);

  // ----------------------------------------------------------
  // Get billing settings
  // ----------------------------------------------------------

  const { data: settings } = await supabase
    .from("dorm_settings")
    .select("billing_due_day")
    .eq("dorm_id", dormId)
    .maybeSingle();

  const dueDay = settings?.billing_due_day ?? 1;

  // Prevent invalid dates such as February 31
  const lastDayOfMonth = periodEnd.getDate();
  const actualDueDay = Math.min(dueDay, lastDayOfMonth);

  const dueDate = new Date(year, month, actualDueDay);

  // ----------------------------------------------------------
  // Get active tenants with assigned rooms
  // ----------------------------------------------------------

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select(
      `
      id,
      profile_id,
      room_id,
      full_name,
      dorm_id,
      status,
      rooms (
        id,
        monthly_rate
      )
    `
    )
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .not("room_id", "is", null);

  if (tenantsError) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Could not load tenants: " + tenantsError.message)
    );
  }

  if (!tenants || tenants.length === 0) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("No active tenants with assigned rooms were found.")
    );
  }

  const billableTenants = tenants
    .filter((t) => t.room_id)
    .map((t) => ({
      ...t,
      room: Array.isArray(t.rooms) ? t.rooms[0] : t.rooms,
    }))
    .filter((t) => t.room);

  // ----------------------------------------------------------
  // Batch-check which of these tenants already have a bill for the
  // current billing period, in one query instead of one per tenant.
  // ----------------------------------------------------------

  const tenantIds = billableTenants.map((t) => t.id);

  const { data: existingBills, error: existingBillsError } = tenantIds.length
    ? await supabase
        .from("bills")
        .select("tenant_id")
        .in("tenant_id", tenantIds)
        .eq("billing_period_start", billingPeriodStart)
        .eq("billing_period_end", billingPeriodEnd)
    : { data: [], error: null };

  if (existingBillsError) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent(
          "Could not check existing bills: " + existingBillsError.message
        )
    );
  }

  const alreadyBilledTenantIds = new Set(
    (existingBills ?? []).map((b) => b.tenant_id)
  );

  const tenantsToBill = billableTenants.filter(
    (t) => !alreadyBilledTenantIds.has(t.id)
  );

  const skippedCount = billableTenants.length - tenantsToBill.length;

  // ----------------------------------------------------------
  // Bulk-insert one bill per remaining tenant in a single insert.
  // ----------------------------------------------------------

  let createdCount = 0;

  if (tenantsToBill.length > 0) {
    const { error: insertError } = await supabase.from("bills").insert(
      tenantsToBill.map((tenant) => ({
        tenant_id: tenant.id,
        room_id: tenant.room_id,
        dorm_id: dormId,
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        due_date: formatDate(dueDate),
        rent_amount: Number(tenant.room?.monthly_rate ?? 0),
        other_charges: 0,
        amount_paid: 0,
        status: "unpaid" as const,
      }))
    );

    if (insertError) {
      redirect(
        "/admin/billing?error=" +
          encodeURIComponent("Could not create bills: " + insertError.message)
      );
    }

    createdCount = tenantsToBill.length;
  }

  revalidatePath("/admin/billing");

  redirect(
    "/admin/billing?saved=" +
      encodeURIComponent(
        `Generated ${createdCount} bill(s). ${skippedCount} existing bill(s) skipped.`
      )
  );
}

// ============================================================
// CREATE BILL MANUALLY
// ============================================================

export async function createBill(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const tenantId = String(formData.get("tenantId") ?? "").trim();

  const billingPeriodStart = String(
    formData.get("billingPeriodStart") ?? ""
  ).trim();

  const billingPeriodEnd = String(
    formData.get("billingPeriodEnd") ?? ""
  ).trim();

  const dueDate = String(formData.get("dueDate") ?? "").trim();

  const rentAmount = Number(formData.get("rentAmount"));

  const otherCharges = Number(formData.get("otherCharges") ?? 0);

  const chargesNote = String(formData.get("chargesNote") ?? "").trim();

  // ----------------------------------------------------------
  // Validate input
  // ----------------------------------------------------------

  if (!tenantId || !billingPeriodStart || !billingPeriodEnd || !dueDate) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Please fill in all required fields.")
    );
  }

  if (!Number.isFinite(rentAmount) || rentAmount < 0) {
    redirect(
      "/admin/billing?error=" + encodeURIComponent("Invalid rent amount.")
    );
  }

  if (!Number.isFinite(otherCharges) || otherCharges < 0) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Invalid other charges amount.")
    );
  }

  const supabase = createAdminClient();

  // ----------------------------------------------------------
  // Verify tenant belongs to this dorm
  // ----------------------------------------------------------

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, room_id, full_name")
    .eq("id", tenantId)
    .eq("dorm_id", dormId)
    .single();

  if (tenantError || !tenant) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent(
          "Tenant not found or does not belong to your dormitory."
        )
    );
  }

  // ----------------------------------------------------------
  // Create bill
  // ----------------------------------------------------------

  const { error } = await supabase.from("bills").insert({
    tenant_id: tenant.id,
    room_id: tenant.room_id,
    dorm_id: dormId,

    billing_period_start: billingPeriodStart,
    billing_period_end: billingPeriodEnd,
    due_date: dueDate,

    rent_amount: rentAmount,
    other_charges: otherCharges,
    charges_note: chargesNote || null,

    amount_paid: 0,
    status: "unpaid",
  });

  if (error) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Could not create bill: " + error.message)
    );
  }

  revalidatePath("/admin/billing");

  redirect("/admin/billing?saved=1");
}

// ============================================================
// RECORD PAYMENT
// ============================================================

export async function recordPayment(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const billId = String(formData.get("billId") ?? "").trim();

  const amount = Number(formData.get("amount"));

  if (!billId) {
    redirect(
      "/admin/billing?error=" + encodeURIComponent("Bill ID is required.")
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Enter a valid payment amount.")
    );
  }

  const supabase = createAdminClient();

  // ----------------------------------------------------------
  // Get bill and verify dorm ownership
  // ----------------------------------------------------------

  const { data: bill, error: billError } = await supabase
    .from("bills")
    .select(
      `
      id,
      tenant_id,
      total_amount,
      amount_paid,
      dorm_id
    `
    )
    .eq("id", billId)
    .eq("dorm_id", dormId)
    .single();

  if (billError || !bill) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Bill not found or access denied.")
    );
  }

  const totalAmount = Number(bill.total_amount);
  const currentPaid = Number(bill.amount_paid);

  const remaining = totalAmount - currentPaid;

  if (amount > remaining) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent(
          `Payment cannot exceed the remaining balance of ${remaining.toFixed(
            2
          )}.`
        )
    );
  }

  const newAmountPaid = currentPaid + amount;

  const newStatus =
    newAmountPaid >= totalAmount
      ? "paid"
      : newAmountPaid > 0
      ? "partial"
      : "unpaid";

  // ----------------------------------------------------------
  // Insert payment
  // ----------------------------------------------------------

  const session = await getSessionUser();

  const { error: paymentError } = await supabase.from("payments").insert({
    bill_id: bill.id,
    tenant_id: bill.tenant_id,
    amount,
    method: "cash",
    paid_at: new Date().toISOString(),
    recorded_by: session!.user.id,
  });

  if (paymentError) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Could not record payment: " + paymentError.message)
    );
  }

  // ----------------------------------------------------------
  // Update bill
  // ----------------------------------------------------------

  const { error: updateError } = await supabase
    .from("bills")
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
    })
    .eq("id", bill.id)
    .eq("dorm_id", dormId);

  if (updateError) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent(
          "Payment was recorded but bill could not be updated: " +
            updateError.message
        )
    );
  }

  revalidatePath("/admin/billing");

  redirect("/admin/billing?saved=1");
}

// ============================================================
// DELETE BILL
// ============================================================

export async function deleteBill(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const billId = String(formData.get("billId") ?? "").trim();

  if (!billId) {
    redirect("/admin/billing");
  }

  const supabase = createAdminClient();

  // ----------------------------------------------------------
  // Only allow deletion of bills belonging to this dorm
  // ----------------------------------------------------------

  const { data: bill, error: billError } = await supabase
    .from("bills")
    .select("id, amount_paid")
    .eq("id", billId)
    .eq("dorm_id", dormId)
    .single();

  if (billError || !bill) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Bill not found or access denied.")
    );
  }

  // Never delete a bill that already has a payment.
  if (Number(bill.amount_paid) > 0) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Paid or partially paid bills cannot be deleted.")
    );
  }

  const { error: deleteError } = await supabase
    .from("bills")
    .delete()
    .eq("id", billId)
    .eq("dorm_id", dormId);

  if (deleteError) {
    redirect(
      "/admin/billing?error=" +
        encodeURIComponent("Could not delete bill: " + deleteError.message)
    );
  }

  revalidatePath("/admin/billing");

  redirect("/admin/billing?saved=1");
}

// ============================================================
// EXPENSES / INCOME (public.transactions)
// ============================================================

const TRANSACTION_TYPES = ["income", "expense"] as const;

const TRANSACTION_CATEGORIES = [
  "rent",
  "other_income",
  "utilities",
  "repairs",
  "supplies",
  "other_expense",
] as const;

export async function createTransaction(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const type = String(formData.get("type") ?? "");
  const category = String(formData.get("category") ?? "");
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const occurredAt = String(formData.get("occurredAt") ?? "").trim();

  if (!TRANSACTION_TYPES.includes(type as (typeof TRANSACTION_TYPES)[number])) {
    redirect(
      "/admin/expenses?error=" + encodeURIComponent("Invalid transaction type.")
    );
  }

  if (
    !TRANSACTION_CATEGORIES.includes(
      category as (typeof TRANSACTION_CATEGORIES)[number]
    )
  ) {
    redirect("/admin/expenses?error=" + encodeURIComponent("Invalid category."));
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(
      "/admin/expenses?error=" + encodeURIComponent("Enter a valid amount.")
    );
  }

  if (!occurredAt) {
    redirect("/admin/expenses?error=" + encodeURIComponent("Pick a date."));
  }

  const session = await getSessionUser();
  const supabase = createAdminClient();

  const { error } = await supabase.from("transactions").insert({
    type,
    category,
    amount,
    description: description || null,
    occurred_at: occurredAt,
    dorm_id: dormId,
    recorded_by: session!.user.id,
  });

  if (error) {
    redirect(
      "/admin/expenses?error=" +
        encodeURIComponent("Could not record transaction: " + error.message)
    );
  }

  revalidatePath("/admin/expenses");

  redirect("/admin/expenses?saved=1");
}

export async function deleteTransaction(formData: FormData) {
  const dormId = await requireOwnerDormId();

  const transactionId = String(formData.get("transactionId") ?? "");

  if (!transactionId) {
    redirect("/admin/expenses");
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("dorm_id", dormId);

  if (error) {
    redirect(
      "/admin/expenses?error=" +
        encodeURIComponent("Could not delete transaction: " + error.message)
    );
  }

  revalidatePath("/admin/expenses");

  redirect("/admin/expenses?saved=1");
}
