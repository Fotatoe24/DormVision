"use client";

import { useEffect, useRef } from "react";

// Wraps a plain GET filter <form> so changing a select/date input
// submits immediately, and typing in a text input submits after a
// short pause -- without needing a per-page click on a "Filter"/
// "Search" button. The button itself is left in place by callers (not
// removed) as a no-JS/accessibility fallback and for an explicit
// immediate submit; this only adds an additional, automatic trigger.
//
// Deliberately framework-free: real `form.requestSubmit()` calls,
// same GET navigation the button already performed, so every existing
// server-side filter/sort/pagination query keeps working unchanged.
export function AutoSubmitForm({
  action,
  className,
  children,
  debounceMs = 450,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    function submitNow() {
      form?.requestSubmit();
    }

    function handleChange(e: Event) {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const inputType = (target as HTMLInputElement).type;
      if (tag === "SELECT" || inputType === "date" || inputType === "checkbox") {
        submitNow();
      }
    }

    function handleInput(e: Event) {
      const target = e.target as HTMLInputElement;
      if (target.tagName !== "INPUT") return;
      if (target.type !== "text" && target.type !== "search") return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(submitNow, debounceMs);
    }

    form.addEventListener("change", handleChange);
    form.addEventListener("input", handleInput);

    return () => {
      form.removeEventListener("change", handleChange);
      form.removeEventListener("input", handleInput);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [debounceMs]);

  return (
    <form ref={formRef} action={action} className={className}>
      {children}
    </form>
  );
}
