import {
  DEFAULT_PALETTE,
  PALETTE_CHANGE_EVENT,
  PALETTE_STORAGE_KEY,
  isPaletteId,
  type PaletteId,
} from "@/lib/palettes";

export type ThemeMode = "light" | "dark" | "system";

// Browser-side helpers for the color-scheme palette. The source of truth is
// the `data-palette` attribute on <html> (set before hydration by the script
// in app/layout.tsx), mirrored into localStorage so it survives reloads.
// Client-only: every function here touches `window` / `document`.

export function subscribePalette(onChange: () => void) {
  window.addEventListener(PALETTE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PALETTE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getPalette(): PaletteId {
  const value = document.documentElement.dataset.palette;
  return isPaletteId(value) ? value : DEFAULT_PALETTE;
}

export function applyPalette(id: PaletteId) {
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) {
    delete root.dataset.palette;
  } else {
    root.dataset.palette = id;
  }

  try {
    if (id === DEFAULT_PALETTE) {
      localStorage.removeItem(PALETTE_STORAGE_KEY);
    } else {
      localStorage.setItem(PALETTE_STORAGE_KEY, id);
    }
  } catch {
    // Private mode / blocked storage: the choice still applies for this
    // visit, it just won't be remembered on this device.
  }

  window.dispatchEvent(new Event(PALETTE_CHANGE_EVENT));
}

// Best-effort save to the user's account. Resolves false (never throws) so
// the picker keeps working per-device if the request or the database column
// isn't available.
export async function saveAppearance(prefs: {
  themeMode?: ThemeMode;
  colorScheme?: PaletteId;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/profile/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    return res.ok;
  } catch {
    return false;
  }
}
