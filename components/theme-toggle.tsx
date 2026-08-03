"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoid hydration mismatch: theme is only known client-side.
  // useSyncExternalStore returns `false` on the server and during the first
  // client render, then `true` once hydrated — no setState-in-effect needed.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div className="h-8 w-[84px] rounded-md border border-border bg-surface" />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle dark mode"
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isDark ? "bg-accent" : "bg-primary"
        }`}
      />
      {isDark ? "Dark" : "Light"}
    </button>
  );
}
