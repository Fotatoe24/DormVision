// Shared pagination math for every list page that needs it. Kept
// deliberately simple (page size fixed per call site, no cursor
// pagination) since every list here is a straightforward Supabase
// `.range()` query with a `{ count: "exact" }` total.
export const DEFAULT_PAGE_SIZE = 10;

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function getRange(page: number, pageSize: number = DEFAULT_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

export function getTotalPages(
  totalCount: number,
  pageSize: number = DEFAULT_PAGE_SIZE
) {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
