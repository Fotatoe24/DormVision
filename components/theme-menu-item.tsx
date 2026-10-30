"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { saveAppearance } from "@/lib/palette-store";

const emptySubscribe = () => () => {};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// A theme toggle styled as a dropdown row, for use inside AccountMenu-
// style menus (components/admin-shell.tsx, components/tenant-shell.tsx)
// alongside Profile/Settings/Sign out, rather than as its own
// standalone button next to the menu trigger.
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoid hydration mismatch: theme is only known client-side. See
  // the same pattern this replaced in the old components/theme-toggle.tsx.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return <div className="h-9 rounded-md" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        const next = isDark ? "light" : "dark";
        setTheme(next);
        // Keep the account in step with the quick toggle, so the next
        // sign-in elsewhere doesn't restore an older saved mode.
        void saveAppearance({ themeMode: next });
      }}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
    >
      <span className="flex items-center gap-2">
        {isDark ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
        {isDark ? "Dark mode" : "Light mode"}
      </span>
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          isDark ? "bg-accent" : "bg-primary"
        }`}
      />
    </button>
  );
}
