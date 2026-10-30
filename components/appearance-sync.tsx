"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import {
  applyPalette,
  getPalette,
  type ThemeMode,
} from "@/lib/palette-store";
import type { PaletteId } from "@/lib/palettes";

// Applies the appearance saved on the user's account when they open the app
// on a device/browser session that hasn't synced yet (e.g. right after
// signing in somewhere new). It runs once per user per browser session, so
// a stale server value from the router cache can never overwrite a change
// the user just made on the Profile page. Renders nothing.
export function AppearanceSync({
  userId,
  themeMode,
  colorScheme,
}: {
  userId: string;
  themeMode: ThemeMode | null;
  colorScheme: PaletteId | null;
}) {
  const { setTheme } = useTheme();

  useEffect(() => {
    const flag = `dv-appearance-synced:${userId}`;

    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {
      // No sessionStorage: sync on every mount rather than never.
    }

    if (themeMode) setTheme(themeMode);
    if (colorScheme && colorScheme !== getPalette()) applyPalette(colorScheme);
    // Runs once per mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
