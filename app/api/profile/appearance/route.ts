import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaletteId } from "@/lib/palettes";

const THEME_MODES = ["light", "dark", "system"];

// ---------------------------------------------------------
// PATCH /api/profile/appearance
// Body: { themeMode?: "light" | "dark" | "system", colorScheme?: <palette id> }
// ---------------------------------------------------------
export async function PATCH(request: Request) {
  const session = await getSessionUser();

  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const update: { theme_mode?: string; color_scheme?: string } = {};

  if (body?.themeMode !== undefined) {
    if (!THEME_MODES.includes(body.themeMode)) {
      return NextResponse.json({ error: "Invalid color mode." }, { status: 400 });
    }
    update.theme_mode = body.themeMode;
  }

  if (body?.colorScheme !== undefined) {
    if (!isPaletteId(body.colorScheme)) {
      return NextResponse.json(
        { error: "Invalid color scheme." },
        { status: 400 }
      );
    }
    update.color_scheme = body.colorScheme;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update(update)
    .eq("id", session.user.id);

  if (error) {
    console.error("Appearance save error:", error);
    return NextResponse.json(
      { error: "Could not save your appearance." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
