"use client";

import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/actions";
import Link from "next/link";
import { Settings, User, LogOut } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function TenantTopbar({ dormName }: { dormName?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — this is a floating dropdown, not
  // a full-screen overlay, so there's no backdrop to catch either of
  // those the way the admin drawer's overlay button does.
  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <div>
          <p className="text-xs text-foreground-muted">
            {dormName ?? "Your dormitory"}
          </p>
          <p className="font-heading text-sm font-semibold text-primary">
            My DormVision
          </p>
        </div>

        {/* Settings menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Settings"
            className={`flex items-center justify-center rounded-md border border-border bg-background p-2 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground ${focusRing}`}
          >
            <Settings className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
            >
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground ${focusRing}`}
              >
                <User className="h-4 w-4" />
                Profile
              </Link>

              <form action={logout}>
                <button
                  type="submit"
                  role="menuitem"
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground ${focusRing}`}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
