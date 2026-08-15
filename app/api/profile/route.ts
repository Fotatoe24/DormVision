import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET_NAME = "avatars";
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

// ---------------------------------------------------------
// PATCH /api/profile
// ---------------------------------------------------------
export async function PATCH(request: Request) {
  const session = await getSessionUser();

  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  // =======================================================
  // FILE UPLOAD
  // =======================================================
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();

    const avatar = formData.get("avatar");

    if (!(avatar instanceof File)) {
      return NextResponse.json(
        { error: "No image was provided." },
        { status: 400 }
      );
    }

    if (!avatar.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Please upload an image file." },
        { status: 400 }
      );
    }

    if (avatar.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "Photo is too large — the limit is 3MB." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // -----------------------------------------------------
    // Get current avatar URL
    // -----------------------------------------------------
    const { data: currentUser, error: currentUserError } = await admin
      .from("users")
      .select("avatar_url")
      .eq("id", session.user.id)
      .single();

    if (currentUserError) {
      console.error("Failed to get current profile:", currentUserError);

      return NextResponse.json(
        { error: "Could not load your profile." },
        { status: 500 }
      );
    }

    // -----------------------------------------------------
    // Determine file extension
    // -----------------------------------------------------
    const extensionMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };

    const extension =
      extensionMap[avatar.type] ??
      avatar.name.split(".").pop()?.toLowerCase() ??
      "jpg";

    // Keep the path tied to the authenticated user.
    const filePath = `${session.user.id}/avatar.${extension}`;

    // -----------------------------------------------------
    // Remove old avatar files first
    // -----------------------------------------------------
    const { data: oldFiles } = await admin.storage
      .from(BUCKET_NAME)
      .list(session.user.id);

    if (oldFiles && oldFiles.length > 0) {
      const filesToDelete = oldFiles
        .filter((file) => file.name.startsWith("avatar."))
        .map((file) => `${session.user.id}/${file.name}`);

      if (filesToDelete.length > 0) {
        const { error: removeError } = await admin.storage
          .from(BUCKET_NAME)
          .remove(filesToDelete);

        if (removeError) {
          console.error("Failed to remove previous avatar:", removeError);
        }
      }
    }

    // -----------------------------------------------------
    // Convert File to ArrayBuffer
    // -----------------------------------------------------
    const arrayBuffer = await avatar.arrayBuffer();

    // -----------------------------------------------------
    // Upload to Supabase Storage
    // -----------------------------------------------------
    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(filePath, arrayBuffer, {
        contentType: avatar.type,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Avatar upload failed:", uploadError);

      return NextResponse.json(
        {
          error:
            "Could not upload your photo. Make sure the avatars storage bucket exists.",
        },
        { status: 500 }
      );
    }

    // -----------------------------------------------------
    // Generate public URL
    // -----------------------------------------------------
    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    // -----------------------------------------------------
    // Save public URL in users.avatar_url
    // -----------------------------------------------------
    const { error: updateError } = await admin
      .from("users")
      .update({
        avatar_url: publicUrl,
      })
      .eq("id", session.user.id);

    if (updateError) {
      console.error("Failed to save avatar URL:", updateError);

      // Clean up uploaded file if DB update failed.
      await admin.storage.from(BUCKET_NAME).remove([filePath]);

      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      avatarUrl: publicUrl,
    });
  }

  // =======================================================
  // JSON REQUESTS
  // =======================================================
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    fullName,
    avatarColor,
    avatarUrl,
    currentPassword,
    newPassword,
    phone,
    emergencyContactName,
    emergencyContactNumber,
  } = body as {
    fullName?: string;
    avatarColor?: string;
    avatarUrl?: string | null;
    currentPassword?: string;
    newPassword?: string;
    phone?: string;
    emergencyContactName?: string;
    emergencyContactNumber?: string;
  };

  // =======================================================
  // REMOVE AVATAR
  // =======================================================
  if (avatarUrl === null) {
    const admin = createAdminClient();

    // Find all avatar files belonging to this user.
    const { data: files, error: listError } = await admin.storage
      .from(BUCKET_NAME)
      .list(session.user.id);

    if (listError) {
      console.error("Failed to list avatar files:", listError);

      return NextResponse.json(
        { error: "Couldn't remove your photo." },
        { status: 500 }
      );
    }

    if (files && files.length > 0) {
      const filesToDelete = files
        .filter((file) => file.name.startsWith("avatar."))
        .map((file) => `${session.user.id}/${file.name}`);

      if (filesToDelete.length > 0) {
        const { error: removeError } = await admin.storage
          .from(BUCKET_NAME)
          .remove(filesToDelete);

        if (removeError) {
          console.error("Failed to remove avatar:", removeError);

          return NextResponse.json(
            { error: "Couldn't remove your photo." },
            { status: 500 }
          );
        }
      }
    }

    // Clear URL from profile.
    const { error: updateError } = await admin
      .from("users")
      .update({
        avatar_url: null,
      })
      .eq("id", session.user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      avatarUrl: null,
    });
  }

  // =======================================================
  // PASSWORD CHANGE
  // =======================================================
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Enter your current password." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        {
          error: "New password must be at least 6 characters.",
        },
        { status: 400 }
      );
    }

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

    return NextResponse.json({
      ok: true,
    });
  }

  // =======================================================
  // CONTACT DETAILS
  // =======================================================
  if (
    phone !== undefined ||
    emergencyContactName !== undefined ||
    emergencyContactNumber !== undefined
  ) {
    const contactUpdates: Record<string, unknown> = {};

    if (phone !== undefined) {
      contactUpdates.contact_number = phone.trim() || null;
    }

    if (emergencyContactName !== undefined) {
      contactUpdates.emergency_contact_name =
        emergencyContactName.trim() || null;
    }

    if (emergencyContactNumber !== undefined) {
      contactUpdates.emergency_contact_number =
        emergencyContactNumber.trim() || null;
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("tenants")
      .update(contactUpdates)
      .eq("profile_id", session.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
    });
  }

  // =======================================================
  // NAME + AVATAR COLOR
  // =======================================================
  const updates: Record<string, unknown> = {};

  if (typeof fullName === "string" && fullName.trim()) {
    updates.full_name = fullName.trim();
  }

  if (typeof avatarColor === "string") {
    updates.avatar_color = avatarColor;
  }

  // This is intentionally NOT used for normal photo uploads.
  // Photos are uploaded through multipart/form-data above.
  if (avatarUrl !== undefined && avatarUrl !== null) {
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

  return NextResponse.json({
    ok: true,
  });
}
