import { createAdminClient } from "@/lib/supabase/admin";
import { isPaletteId, type PaletteId } from "@/lib/palettes";
import type { ThemeMode } from "@/lib/palette-store";

export type SavedAppearance = {
  themeMode: ThemeMode | null;
  colorScheme: PaletteId | null;
};

// The user's saved color mode + palette (see migration 0017). Never throws
// and never blocks a page: if the columns don't exist yet or the query
// fails, it reports "nothing saved" and the device's own settings stay.
export async function getSavedAppearance(
  userId: string | null | undefined
): Promise<SavedAppearance> {
  const none: SavedAppearance = { themeMode: null, colorScheme: null };
  if (!userId) return none;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("users")
      .select("theme_mode, color_scheme")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return none;

    return {
      themeMode:
        data.theme_mode === "light" ||
        data.theme_mode === "dark" ||
        data.theme_mode === "system"
          ? data.theme_mode
          : null,
      colorScheme: isPaletteId(data.color_scheme) ? data.color_scheme : null,
    };
  } catch {
    return none;
  }
}
