"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .eq("id", data.user!.id)
    .single();

  redirect(profile?.role === "owner" ? "/admin" : "/tenant");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// ---------- Owner sign-up: creates the auth account, THEN
// explicitly writes public.users + public.dormitories ----------
// No DB trigger involved. This only runs once a session exists
// (i.e. email confirmation is off, or already satisfied) because
// the inserts below run as the signed-in user and are subject to
// RLS (see 0004_explicit_signup.sql for the policies that allow
// "insert your own row").
export async function signUpOwner(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const dormName = String(formData.get("dormName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !dormName || !email || !password) {
    redirect("/signup?error=" + encodeURIComponent("Fill in every field."));
  }

  // Normal Supabase client — used for creating the Auth account
  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
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

  /*
   * IMPORTANT:
   *
   * Do NOT check signUpData.session here.
   *
   * When email confirmation is enabled:
   *
   * user   = exists
   * session = null
   *
   * So we can still create the application's
   * public.users and public.dormitories records
   * using the server-side admin client.
   */

  const admin = createAdminClient();

  // Create public.users record
  const { error: userError } = await admin.from("users").insert({
    id: userId,
    role: "owner",
    full_name: fullName,
    email,
  });

  if (userError) {
    // Optional cleanup:
    // remove the Auth account if application profile creation failed.
    await admin.auth.admin.deleteUser(userId);

    redirect(
      "/signup?error=" +
        encodeURIComponent(
          "Could not create owner profile: " + userError.message
        )
    );
  }

  // Create dormitory
  const { data: dorm, error: dormError } = await admin
    .from("dormitories")
    .insert({
      name: dormName,
      owner_id: userId,
    })
    .select("id")
    .single();

  if (dormError || !dorm) {
    // Clean up the profile if dormitory creation fails
    await admin.from("users").delete().eq("id", userId);

    await admin.auth.admin.deleteUser(userId);

    redirect(
      "/signup?error=" +
        encodeURIComponent(dormError?.message ?? "Could not create dormitory.")
    );
  }

  // Connect owner to their dormitory
  const { error: updateError } = await admin
    .from("users")
    .update({
      dorm_id: dorm.id,
    })
    .eq("id", userId);

  if (updateError) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(
          "Dormitory was created but owner profile could not be updated: " +
            updateError.message
        )
    );
  }

  /*
   * If email confirmation is enabled, the user has no session yet.
   * Therefore send them to a confirmation page instead of /admin.
   */
  if (!signUpData.session) {
    redirect(
      "/signup?success=" +
        encodeURIComponent(
          "Account created! Please check your email to confirm your account before signing in."
        )
    );
  }

  // If email confirmation is disabled, they already have a session.
  redirect("/admin");
}

// ---------- Tenant sign-up: joins an existing dormitory via its Dorm ID ----------
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

  // Validate the Dorm ID *before* creating the account, via a locked-down
  // lookup function rather than a raw table query.
  const { data: matches, error: lookupError } = await supabase.rpc(
    "lookup_dormitory_by_code",
    { p_code: dormCode }
  );

  if (lookupError || !matches || matches.length === 0) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "That Dorm ID wasn't found. Check with your dorm owner."
        )
    );
  }

  const dormId = matches![0].id;

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError || !signUpData.user) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(signUpError?.message ?? "Could not create account.")
    );
  }

  const userId = signUpData.user!.id;

  /*
   * IMPORTANT — same reasoning as owner signup:
   *
   * Do NOT branch on signUpData.session before writing the profile rows.
   *
   * When email confirmation is enabled:
   *
   * user    = exists
   * session = null
   *
   * Using the server-side admin client here (bypasses RLS, doesn't
   * require a session) writes both rows immediately regardless of
   * confirmation state, exactly like signUpOwner already does.
   */
  const admin = createAdminClient();

  // public.users — the application auth profile (role, credentials link)
  const { error: userError } = await admin.from("users").insert({
    id: userId,
    role: "tenant",
    full_name: fullName,
    email,
    phone: phone || null,
    dorm_id: dormId,
  });

  if (userError) {
    // Clean up the orphaned auth account if the profile row couldn't be created.
    await admin.auth.admin.deleteUser(userId);

    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "Could not create tenant profile: " + userError.message
        )
    );
  }

  // public.tenants — the occupancy record (room assignment, move-in/out,
  // status). room_id stays null here; an owner assigns a room later from
  // /admin/rooms.
  const { error: tenantError } = await admin.from("tenants").insert({
    profile_id: userId,
    dorm_id: dormId,
    full_name: fullName,
    contact_number: phone || null,
  });

  if (tenantError) {
    // Roll back the users row too, so we never leave a users row with no
    // matching tenants row.
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);

    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(
          "Could not create tenant record: " + tenantError.message
        )
    );
  }

  /*
   * If email confirmation is enabled, the user has no session yet.
   * Send them to sign in with a note to confirm their email first,
   * instead of pretending they're already logged in.
   */
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

// ---------- Tenant profile: phone + emergency contact ----------
export async function updateTenantProfile(formData: FormData) {
  const session = await getSessionUser();
  if (!session) redirect("/");

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
// Phase 1 — Dormitory Management: rooms & tenant assignment
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
  return session.profile!.dorm_id as string;
}

// Recomputes a room's status from occupancy vs capacity, preserving a
// manually-set 'maintenance' status rather than overwriting it.
async function syncRoomStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string
) {
  const { data: room } = await supabase
    .from("rooms")
    .select("capacity, status")
    .eq("id", roomId)
    .single();

  if (!room || room.status === "maintenance") return;

  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  const nextStatus = (count ?? 0) >= room.capacity ? "full" : "available";

  await supabase.from("rooms").update({ status: nextStatus }).eq("id", roomId);
}

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
  await requireOwnerDormId();
  const roomId = String(formData.get("roomId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!roomId || !["available", "full", "maintenance"].includes(status)) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent("Invalid room update.")
    );
  }

  const supabase = await createClient();
  await supabase.from("rooms").update({ status }).eq("id", roomId);

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function deleteRoom(formData: FormData) {
  await requireOwnerDormId();
  const roomId = String(formData.get("roomId") ?? "");
  if (!roomId) redirect("/admin/rooms");

  const supabase = await createClient();

  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if ((count ?? 0) > 0) {
    redirect(
      "/admin/rooms?error=" +
        encodeURIComponent("Move tenants out of this room before deleting it.")
    );
  }

  await supabase.from("rooms").delete().eq("id", roomId);

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function assignTenantToRoom(formData: FormData) {
  await requireOwnerDormId();
  const tenantId = String(formData.get("tenantId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");

  if (!tenantId || !roomId) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent("Pick a tenant and a room.")
    );
  }

  const supabase = await createClient();

  const { data: room } = await supabase
    .from("rooms")
    .select("capacity")
    .eq("id", roomId)
    .single();

  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (room && (count ?? 0) >= room.capacity) {
    redirect(
      "/admin/rooms?error=" + encodeURIComponent("That room is already full.")
    );
  }

  const { error } = await supabase
    .from("users")
    .update({ room_id: roomId })
    .eq("id", tenantId);

  if (error) {
    redirect("/admin/rooms?error=" + encodeURIComponent(error.message));
  }

  await syncRoomStatus(supabase, roomId);

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function removeTenantFromRoom(formData: FormData) {
  await requireOwnerDormId();
  const tenantId = String(formData.get("tenantId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  if (!tenantId) redirect("/admin/rooms");

  const supabase = await createClient();
  await supabase.from("users").update({ room_id: null }).eq("id", tenantId);

  if (roomId) await syncRoomStatus(supabase, roomId);

  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}
