"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  });

  if (signUpError || !signUpData.user) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(signUpError?.message ?? "Could not create account.")
    );
  }

  const userId = signUpData.user!.id;

  const { error: userInsertError } = await supabase.from("users").insert({
    id: userId,
    role: "owner",
    full_name: fullName,
    email,
  });

  if (userInsertError) {
    redirect("/signup?error=" + encodeURIComponent(userInsertError.message));
  }

  const { data: dorm, error: dormError } = await supabase
    .from("dormitories")
    .insert({ name: dormName, owner_id: userId })
    .select("id")
    .single();

  if (dormError || !dorm) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(dormError?.message ?? "Could not create dormitory.")
    );
  }

  await supabase.from("users").update({ dorm_id: dorm!.id }).eq("id", userId);

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

  const { error: userInsertError } = await supabase.from("users").insert({
    id: signUpData.user!.id,
    role: "tenant",
    full_name: fullName,
    email,
    phone,
    dorm_id: dormId,
  });

  if (userInsertError) {
    redirect(
      "/signup/tenant?error=" + encodeURIComponent(userInsertError.message)
    );
  }

  redirect("/tenant");
}
