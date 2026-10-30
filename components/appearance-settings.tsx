"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_PALETTE, PALETTES, type PaletteId } from "@/lib/palettes";
import {
  applyPalette,
  getPalette,
  saveAppearance,
  subscribePalette,
  type ThemeMode,
} from "@/lib/palette-store";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const emptySubscribe = () => () => {};

const MODES = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

// Tiny fixed-color mock of the app shell, so each mode card previews what
// it will look like regardless of the theme currently active.
const PREVIEW_LIGHT = {
  bg: "#f5f9fc",
  card: "#ffffff",
  bar: "#022B47",
  line: "#d7e3ea",
};
const PREVIEW_DARK = {
  bg: "#051c2c",
  card: "#0c2c46",
  bar: "#0c2c46",
  line: "#1c3c54",
};

function PreviewShell({ c }: { c: typeof PREVIEW_LIGHT }) {
  return (
    <div className="flex h-full w-full gap-1 p-1.5" style={{ background: c.bg }}>
      <div className="h-full w-3 rounded-sm" style={{ background: c.bar }} />
      <div className="flex flex-1 flex-col gap-1">
        <div
          className="h-2 w-3/4 rounded-sm"
          style={{ background: c.card, border: `1px solid ${c.line}` }}
        />
        <div
          className="flex-1 rounded-sm"
          style={{ background: c.card, border: `1px solid ${c.line}` }}
        />
      </div>
    </div>
  );
}

function ModePreview({ mode }: { mode: "light" | "dark" | "system" }) {
  if (mode === "system") {
    return (
      <div className="flex h-full w-full">
        <div className="h-full w-1/2 overflow-hidden">
          <PreviewShell c={PREVIEW_LIGHT} />
        </div>
        <div className="h-full w-1/2 overflow-hidden">
          <div className="h-full w-[200%] -translate-x-1/2">
            <PreviewShell c={PREVIEW_DARK} />
          </div>
        </div>
      </div>
    );
  }

  return <PreviewShell c={mode === "light" ? PREVIEW_LIGHT : PREVIEW_DARK} />;
}

export function AppearanceSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const palette = useSyncExternalStore(
    subscribePalette,
    getPalette,
    () => DEFAULT_PALETTE
  );
  // `theme` is only known client-side; hold off highlighting a mode until
  // mounted to avoid a hydration mismatch.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const activeMode = mounted ? (theme ?? "light") : null;
  const isDark = resolvedTheme === "dark";
  const activePalette = PALETTES.find((p) => p.id === palette) ?? PALETTES[0];

  // Apply immediately on this device, then sync to the account in the
  // background. If the account save fails, the choice still holds here.
  async function syncToAccount(prefs: {
    themeMode?: ThemeMode;
    colorScheme?: PaletteId;
  }) {
    const ok = await saveAppearance(prefs);
    if (!ok) {
      toast.error(
        "Saved on this device, but couldn't sync it to your account."
      );
    }
  }

  function chooseMode(mode: ThemeMode) {
    setTheme(mode);
    void syncToAccount({ themeMode: mode });
  }

  function choosePalette(id: PaletteId) {
    applyPalette(id);
    void syncToAccount({ colorScheme: id });
  }

  return (
    <div className="mb-5 space-y-5 rounded-lg border border-border bg-surface p-5">
      <div>
        <p className="font-heading text-sm font-semibold">Appearance</p>
        <p className="mt-0.5 text-xs text-foreground-muted">
          Choose how DormVision looks to you. Saved to your account, so it follows you to other devices.
        </p>
      </div>

      {/* Mode */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground-muted">
          Mode
        </p>

        <div
          role="radiogroup"
          aria-label="Color mode"
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          {MODES.map(({ key, label, icon: Icon }) => {
            const selected = activeMode === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseMode(key)}
                className={`group rounded-lg border-2 p-1.5 text-left transition ${focusRing} ${
                  selected
                    ? "border-primary bg-surface-muted"
                    : "border-border hover:border-foreground-muted"
                }`}
              >
                <div className="h-14 overflow-hidden rounded-md border border-border sm:h-16">
                  <ModePreview mode={key} />
                </div>
                <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5 text-xs font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-foreground-muted" />
                    {label}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>

        {activeMode === "system" && (
          <p className="mt-1.5 text-xs text-foreground-muted">
            Following your device — currently {isDark ? "dark" : "light"}.
          </p>
        )}
      </div>

      {/* Color scheme */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-foreground-muted">
            Color scheme
          </p>
          <p className="text-xs text-foreground-muted">
            {activePalette.label} · {activePalette.blurb}
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Color scheme"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
        >
          {PALETTES.map((p) => {
            const selected = palette === p.id;
            const [primary, accent, sidebar] = isDark
              ? p.swatch.dark
              : p.swatch.light;

            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choosePalette(p.id)}
                className={`flex items-center gap-3 rounded-lg border-2 p-2.5 text-left transition ${focusRing} ${
                  selected
                    ? "border-primary bg-surface-muted"
                    : "border-border hover:border-foreground-muted"
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border"
                >
                  <span className="h-full w-1/3" style={{ background: sidebar }} />
                  <span className="h-full w-1/3" style={{ background: primary }} />
                  <span className="h-full w-1/3" style={{ background: accent }} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {p.label}
                  </span>
                </span>

                {selected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {palette !== DEFAULT_PALETTE && (
        <button
          type="button"
          onClick={() => choosePalette(DEFAULT_PALETTE)}
          className="text-xs font-medium text-foreground-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Reset to default scheme
        </button>
      )}
    </div>
  );
}
