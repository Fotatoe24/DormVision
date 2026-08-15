import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3MB

const AVATAR_BUCKET = "avatars";

export async function PATCH(request: Request) {
  const session = await getSessionUser();

  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // =========================================================
  // AVATAR UPLOAD / MULTIPART REQUEST
  // =========================================================

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("avatar");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "No image file was provided." },
          { status: 400 }
        );
      }

      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "Please upload an image file." },
          { status: 400 }
        );
      }

      if (file.size > MAX_AVATAR_BYTES) {
        return NextResponse.json(
          { error: "Photo is too large — the limit is 3MB." },
          { status: 400 }
        );
      }

      const admin = createAdminClient();

      // -------------------------------------------------------
      // Determine file extension
      // -------------------------------------------------------

      const extensionMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      };

      const extension = extensionMap[file.type] ?? "jpg";

      // Store each user's avatar in their own folder.
      //
      // Example:
      //
      // avatars/
      //   649522dc-1139-40a8-9b29-00433451130b/
      //     avatar.jpg
      //
      const filePath = `${session.user.id}/avatar.${extension}`;

      const fileBuffer = Buffer.from(await file.arrayBuffer());

      // -------------------------------------------------------
      // Upload to Supabase Storage
      // -------------------------------------------------------

      const { error: uploadError } = await admin.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, fileBuffer, {
          contentType: file.type,
          upsert: true,
          cacheControl: "3600",
        });

      if (uploadError) {
        console.error("Avatar upload error:", uploadError);

        return NextResponse.json(
          {
            error:
              "Could not upload your photo. Make sure the avatars storage bucket exists.",
            details: uploadError.message,
          },
          { status: 500 }
        );
      }

      // -------------------------------------------------------
      // Get public URL
      // -------------------------------------------------------

      const {
        data: { publicUrl },
      } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

      // -------------------------------------------------------
      // Save URL to public.users
      // -------------------------------------------------------

      const { error: updateError } = await admin
        .from("users")
        .update({
          avatar_url: publicUrl,
        })
        .eq("id", session.user.id);

      if (updateError) {
        console.error("Failed to save avatar URL:", updateError);

        return NextResponse.json(
          {
            error: "Photo uploaded, but the profile could not be updated.",
            details: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        avatarUrl: publicUrl,
      });
    } catch (error) {
      console.error("Avatar upload error:", error);

      return NextResponse.json(
        {
          error: "Something went wrong while uploading your photo.",
        },
        { status: 500 }
      );
    }
  }

  // =========================================================
  // JSON REQUESTS
  // =========================================================

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    fullName,
    avatarColor,
    removeAvatar,
    currentPassword,
    newPassword,
    phone,
    emergencyContactName,
    emergencyContactNumber,
  } = body as {
    fullName?: string;
    avatarColor?: string;
    removeAvatar?: boolean;
    currentPassword?: string;
    newPassword?: string;
    phone?: string;
    emergencyContactName?: string;
    emergencyContactNumber?: string;
  };

  // =========================================================
  // PASSWORD CHANGE
  // =========================================================

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

    // Verify current password using a separate Supabase client.
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

  // =========================================================
  // REMOVE AVATAR
  // =========================================================

  if (removeAvatar === true) {
    const admin = createAdminClient();

    // Get the current avatar URL first.
    const { data: user, error: userFetchError } = await admin
      .from("users")
      .select("avatar_url")
      .eq("id", session.user.id)
      .single();

    if (userFetchError) {
      return NextResponse.json(
        { error: userFetchError.message },
        { status: 400 }
      );
    }

    // -------------------------------------------------------
    // Delete current file from Storage
    // -------------------------------------------------------

    if (user?.avatar_url) {
      try {
        const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

        const markerIndex = user.avatar_url.indexOf(marker);

        if (markerIndex !== -1) {
          const filePath = user.avatar_url.substring(
            markerIndex + marker.length
          );

          if (filePath) {
            const { error: deleteError } = await admin.storage
              .from(AVATAR_BUCKET)
              .remove([filePath]);

            if (deleteError) {
              console.error("Failed to delete old avatar:", deleteError);
            }
          }
        }
      } catch (error) {
        console.error("Error deleting old avatar:", error);
      }
    }

    // -------------------------------------------------------
    // Clear database URL
    // -------------------------------------------------------

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

  // =========================================================
  // CONTACT DETAILS
  // =========================================================

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

  // =========================================================
  // NAME + AVATAR COLOR
  // =========================================================

  const updates: Record<string, unknown> = {};

  if (typeof fullName === "string" && fullName.trim()) {
    updates.full_name = fullName.trim();
  }

  if (typeof avatarColor === "string") {
    updates.avatar_color = avatarColor;
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
