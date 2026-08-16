"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// AUTHENTICATION
// ============================================================

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

// Where Supabase should send the user after they click an email link
// (confirmation or password recovery) — always lands on /auth/callback,
// optionally forwarding to a specific page once the session is set up.
async function getAuthCallbackUrl(next?: string) {
  const origin = await getSiteOrigin();
  const url = `${origin}/auth/callback`;

  return next ? `${url}?next=${encodeURIComponent(next)}` : url;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/?error=" + encodeURIComponent("Enter your email and password."));
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(
      "/?error=" + encodeURIComponent(error?.message ?? "Sign in failed.")
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .single();

  redirect(profile?.role === "owner" ? "/admin" : "/tenant");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/");
}

// ============================================================
// PASSWORD RESET
// ============================================================

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect(
      "/forgot-password?error=" + encodeURIComponent("Enter your email.")
    );
  }

  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await getAuthCallbackUrl("/reset-password"),
  });

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
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || password.length < 6) {
    redirect(
      "/reset-password?error=" +
        encodeURIComponent("Password must be at least 6 characters.")
    );
  }

  if (password !== confirmPassword) {
    redirect(
      "/reset-password?error=" + encodeURIComponent("Passwords don't match.")
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/reset-password?error=" + encodeURIComponent(error.message));
  }

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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !dormName || !email || !password) {
    redirect("/signup?error=" + encodeURIComponent("Fill in every field."));
  }

  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await getAuthCallbackUrl(),
      data: {
        full_name: fullName,
        dorm_name: dormName,
        role: "owner",
      },
    },
  });

  if (signUpError || !signUpData.user) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(signUpError?.message ?? "Could not create account.")
    );
  }

  const userId = signUpData.user.id;
  const admin = createAdminClient();

  // Creates the users row, the dormitories row, and backfills
  // users.dorm_id all inside one Postgres transaction — see
  // supabase/migrations/0003_create_owner_account_rpc.sql. Either all
  // three writes land or none do; the only failure path left is
  // deleting the just-created auth user.
  const { error: createError } = await admin.rpc("create_owner_account", {
    p_user_id: userId,
    p_full_name: fullName,
    p_email: email,
    p_dorm_name: dormName,
  });

  if (createError) {
    await admin.auth.admin.deleteUser(userId);

    redirect(
      "/signup?error=" +
        encodeURIComponent(
          "Could not create owner account: " + createError.message
        )
    );
  }

  if (!signUpData.session) {
    redirect(
      "/signup?success=" +
        encodeURIComponent(
          "Account created! Please check your email to confirm your account before signing in."
        )
    );
  }

  redirect("/admin");
}

// ============================================================
// TENANT SIGN-UP
// ============================================================

export async function signUpTenant(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const dormCode = String(formData.get("dormCode") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !dormCode || !email || !password) {
    redirect(
      "/signup/tenant?error=" + encodeURIComponent("Fill in every field.")
    );
  }

  const supabase = await createClient();

  // Existing dorm lookup — unchanged
  const { data: matches, error: lookupError } = await supabase.rpc(
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

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await getAuthCallbackUrl(),
    },
  });

  if (signUpError || !signUpData.user) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(signUpError?.message ?? "Could not create account.")
    );
  }

  const userId = signUpData.user.id;
  const admin = createAdminClient();

  const { error: userError } = await admin.from("users").insert({
    id: userId,
    role: "tenant",
    full_name: fullName,
    email,
    phone: phone || null,
    dorm_id: dormId,
  });

  if (userError) {
    await admin.auth.admin.deleteUser(userId);

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
    await admin.auth.admin.deleteUser(userId);

    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "Could not create tenant record: " + tenantError.message
        )
    );
  }

  if (!signUpData.session) {
    redirect(
      "/?success=" +
        encodeURIComponent(
          "Account created! Please check your email to confirm your account before signing in."
        )
    );
  }

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

  const supabase = await createClient();

  const { error } = await supabase
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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

  const supabase = await createClient();

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

  const supabase = await createClient();

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

  const supabase = await createClient();

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

  const supabase = await createClient();

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

  const supabase = await createClient();

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

  const supabase = await createClient();

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

  let createdCount = 0;
  let skippedCount = 0;

  // ----------------------------------------------------------
  // Create one bill per tenant
  // ----------------------------------------------------------

  for (const tenant of tenants) {
    if (!tenant.room_id) {
      continue;
    }

    const room = Array.isArray(tenant.rooms) ? tenant.rooms[0] : tenant.rooms;

    if (!room) {
      continue;
    }

    const rentAmount = Number(room.monthly_rate ?? 0);

    // Check whether this tenant already has a bill
    // for the current billing period.
    const { data: existingBill, error: existingBillError } = await supabase
      .from("bills")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("billing_period_start", billingPeriodStart)
      .eq("billing_period_end", billingPeriodEnd)
      .maybeSingle();

    if (existingBillError) {
      redirect(
        "/admin/billing?error=" +
          encodeURIComponent(
            "Could not check existing bills: " + existingBillError.message
          )
      );
    }

    if (existingBill) {
      skippedCount++;
      continue;
    }

    const { error: insertError } = await supabase.from("bills").insert({
      tenant_id: tenant.id,
      room_id: tenant.room_id,
      dorm_id: dormId,
      billing_period_start: billingPeriodStart,
      billing_period_end: billingPeriodEnd,
      due_date: formatDate(dueDate),
      rent_amount: rentAmount,
      other_charges: 0,
      amount_paid: 0,
      status: "unpaid",
    });

    if (insertError) {
      redirect(
        "/admin/billing?error=" +
          encodeURIComponent(
            "Could not create bill for " +
              tenant.full_name +
              ": " +
              insertError.message
          )
      );
    }

    createdCount++;
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

  const supabase = await createClient();

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

  const supabase = await createClient();

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

  const supabase = await createClient();

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
