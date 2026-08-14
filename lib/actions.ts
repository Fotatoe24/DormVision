"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

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

// ---------- Owner sign-up: creates the account AND the dormitory ----------
// The `users` and `dormitories` rows are created by a DB trigger
// (handle_new_signup) reading auth metadata below — not by client inserts.
// This keeps sign-up working whether or not Supabase email confirmation is
// enabled, since client inserts would otherwise need a session that doesn't
// exist yet pre-confirmation.
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
      data: { role: "owner", full_name: fullName, dorm_name: dormName },
    },
  });

  if (signUpError || !signUpData.user) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(signUpError?.message ?? "Could not create account.")
    );
  }

  if (!signUpData.session) {
    // Email confirmation is required — no session yet, nothing to redirect
    // into behind the middleware's auth check.
    redirect(
      "/?error=" +
        encodeURIComponent(
          "Check your email to confirm your account, then sign in."
        )
    );
  }

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

  // matches[0].id confirms the code is valid; the actual dorm_id used for
  // the new user is re-resolved server-side from dormCode by the trigger,
  // so a tampered dorm_id can never be smuggled in via client metadata.
  void matches;

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "tenant",
        full_name: fullName,
        phone,
        dorm_code: dormCode,
      },
    },
  });

  if (signUpError || !signUpData.user) {
    redirect(
      "/signup/tenant?error=" +
        encodeURIComponent(signUpError?.message ?? "Could not create account.")
    );
  }

  if (!signUpData.session) {
    redirect(
      "/?error=" +
        encodeURIComponent(
          "Check your email to confirm your account, then sign in."
        )
    );
  }

  redirect("/tenant");
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
