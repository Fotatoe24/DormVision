import { manilaToday } from "@/lib/reminders";

// Reading and validating the filters an export is asked for. Pure, so the rules
// (especially the Manila day boundaries) can be tested.

export const EXPORT_KINDS = ["payments", "income-expenses", "bills", "tenants", "rooms"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function parseExportKind(value: string | undefined): ExportKind | null {
  return (EXPORT_KINDS as readonly string[]).includes(value ?? "") ? (value as ExportKind) : null;
}

// A real calendar date written YYYY-MM-DD, or null. ("2026-02-31" is not one.)
export function parseIsoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? value
    : null;
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// "From the 1st through the 30th" means from 00:00 on the 1st to 00:00 on the
// 1st of next month, in MANILA time -- the database stores instants, and a
// payment at 6 AM on the 1st in Manila is still the 31st in UTC.
export function manilaDayRange(from: string | null, to: string | null) {
  return {
    fromIso: from ? `${from}T00:00:00+08:00` : null,
    toExclusiveIso: to ? `${addDays(to, 1)}T00:00:00+08:00` : null,
  };
}

// The three periods the Income & Expenses page offers. `end` is exclusive.
export const INCOME_RANGES = ["this_month", "last_month", "ytd"] as const;
export type IncomeRange = (typeof INCOME_RANGES)[number];

export const incomeRangeLabels: Record<IncomeRange, string> = {
  this_month: "This month",
  last_month: "Last month",
  ytd: "Year to date",
};

export function incomeRangeBounds(range: IncomeRange, today: string = manilaToday()) {
  const [y, m] = today.split("-").map(Number);
  const first = (year: number, month: number) =>
    new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);

  if (range === "last_month") return { start: first(y, m - 1), end: first(y, m) };
  if (range === "ytd") return { start: first(y, 1), end: first(y, m + 1) };
  return { start: first(y, m), end: first(y, m + 1) };
}

export function parseIncomeRange(value: string | null | undefined): IncomeRange {
  return (INCOME_RANGES as readonly string[]).includes(value ?? "")
    ? (value as IncomeRange)
    : "this_month";
}

// A person-readable date like "5 Nov 2026" from YYYY-MM-DD.
export function prettyDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function describeDateFilter(from: string | null, to: string | null) {
  if (from && to) return `${prettyDate(from)} to ${prettyDate(to)}`;
  if (from) return `From ${prettyDate(from)}`;
  if (to) return `Up to ${prettyDate(to)}`;
  return "All dates";
}

// Filenames: lower-case words joined with dashes, safe on every operating system.
export function slugify(text: string) {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "dorm"
  );
}

export function exportFileName(dormName: string, kind: ExportKind, today: string, detail?: string) {
  return [slugify(dormName), kind, detail ? slugify(detail) : null, today]
    .filter(Boolean)
    .join("_") + ".xlsx";
}

// Escapes the characters that break out of a PostgREST ilike pattern or an
// .or() filter list.
export function likeTerm(text: string) {
  return text.replace(/[%_,()*\\]/g, " ").trim();
}
