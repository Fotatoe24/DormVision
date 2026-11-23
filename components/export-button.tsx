"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";

// "Export to Excel" for the owner pages. Downloads /api/admin/export/<kind> with
// the filters currently on screen. It fetches the file instead of linking to it
// so a failure (signed out, rate limit, server error) shows a message instead of
// saving the error text as a file.
//
// With `options`, the button opens a small panel first, for exports whose
// filters aren't on the page (a date range, a status).

type Options = {
  dates?: boolean;
  statuses?: { value: string; label: string }[];
  statusLabel?: string;
};

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary";

function filenameFrom(header: string | null, fallback: string) {
  const match = /filename="?([^";]+)"?/i.exec(header ?? "");
  return match?.[1] ?? fallback;
}

export function ExportButton({
  kind,
  params = {},
  label = "Export to Excel",
  options,
}: {
  kind: string;
  params?: Record<string, string | undefined>;
  label?: string;
  options?: Options;
}) {
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const panelRef = useRef<HTMLDetailsElement>(null);

  async function download() {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    if (status) search.set("status", status);

    if (from && to && from > to) {
      toast.error("The start date is after the end date.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/admin/export/${kind}?${search.toString()}`);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? "We couldn't create the export. Please try again.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(response.headers.get("content-disposition"), `${kind}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      toast.success("Your Excel file is downloading.");
      if (panelRef.current) panelRef.current.open = false;
    } catch {
      toast.error("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const spinner = (
    <span
      aria-hidden
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );

  if (!options) {
    return (
      <button type="button" onClick={download} disabled={busy} aria-busy={busy} className={buttonClass}>
        {busy ? spinner : <Download aria-hidden className="h-4 w-4" />}
        {busy ? "Preparing…" : label}
      </button>
    );
  }

  return (
    <details ref={panelRef} className="relative">
      <summary className={`${buttonClass} cursor-pointer list-none`}>
        <Download aria-hidden className="h-4 w-4" />
        {label}
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-lg border border-border bg-surface p-4 shadow-lg">
        {options.dates && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${kind}-from`} className="mb-1 block text-xs text-foreground-muted">
                Due from
              </label>
              <input id={`${kind}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor={`${kind}-to`} className="mb-1 block text-xs text-foreground-muted">
                Due until
              </label>
              <input id={`${kind}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
            </div>
          </div>
        )}

        {options.statuses && (
          <div>
            <label htmlFor={`${kind}-status`} className="mb-1 block text-xs text-foreground-muted">
              {options.statusLabel ?? "Status"}
            </label>
            <select id={`${kind}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
              <option value="">All</option>
              {options.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-foreground-muted">Leave a field empty to include everything.</p>

        <button type="button" onClick={download} disabled={busy} aria-busy={busy} className={`${buttonClass} w-full justify-center bg-primary text-surface hover:bg-primary hover:opacity-90`}>
          {busy ? spinner : <Download aria-hidden className="h-4 w-4" />}
          {busy ? "Preparing…" : "Download"}
        </button>
      </div>
    </details>
  );
}
