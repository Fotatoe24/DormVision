import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3MB, matches client-side check

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { fullName, avatarColor, avatarUrl, currentPassword, newPassword } =
    body as {
      fullName?: string;
      avatarColor?: string;
      avatarUrl?: string | null;
      currentPassword?: string;
      newPassword?: string;
    };

  // ---------- Password change ----------
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Enter your current password." },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 }
      );
    }

    // Verify the current password with a throwaway client — signing in
    // here does not touch the real session cookie.
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: session.user.email!,
      password: currentPassword,
    });
    if (verifyError) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  }

  // ---------- Avatar / name / color ----------
  if (avatarUrl && avatarUrl.length > MAX_AVATAR_BYTES * 1.4) {
    // base64 inflates size ~1.33x; rough guard before hitting the DB.
    return NextResponse.json(
      { error: "Photo is too large — the limit is 3MB." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof fullName === "string" && fullName.trim()) {
    updates.full_name = fullName.trim();
  }
  if (typeof avatarColor === "string") {
    updates.avatar_color = avatarColor;
  }
  if (avatarUrl !== undefined) {
    updates.avatar_url = avatarUrl;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update(updates)
    .eq("id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
