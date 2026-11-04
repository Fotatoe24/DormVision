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

// A link to page `p` of ONE list, on a page that may hold several (a tenant's
// bills AND payments, say, each with its own page number). Every other query
// parameter is kept as it is; page 1 is the default, so it gets no parameter.
export function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  key: string,
  p: number
) {
  const search = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (k !== key && v !== undefined && v !== "") search.set(k, v);
  }
  if (p > 1) search.set(key, String(p));

  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// PostgREST refuses a .range() that starts beyond the last row (PGRST103) --
// what a stale bookmark or a hand-typed ?page=99 produces. Callers send the
// person back to page 1 of that list instead of showing a load error.
export function isPageOutOfRange(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST103";
}
