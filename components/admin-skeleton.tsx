// Loading skeletons for the owner (/admin) pages. They render inside
// AdminShell's <main>, so the sidebar and header stay put while the page's
// data loads. Widths mirror each page's real container (max-w-5xl for the
// dashboard and expenses, max-w-3xl for the list pages) so nothing jumps
// when the content streams in.
function Block({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-surface-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

function PageHeader() {
  return (
    <div className="mb-6 space-y-2">
      <Block className="h-6 w-44" />
      <Block className="h-3 w-72 max-w-full" />
    </div>
  );
}

export function AdminListSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`mx-auto ${wide ? "max-w-5xl" : "max-w-3xl"}`}
    >
      <PageHeader />

      <div className="mb-4 flex flex-wrap gap-2">
        <Block className="h-10 min-w-[160px] flex-1" />
        <Block className="h-10 w-32" />
        <Block className="h-10 w-24" />
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Block className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Block className="h-3.5 w-1/2" />
              <Block className="h-3 w-1/3" />
            </div>
            <Block className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      className="mx-auto max-w-5xl"
    >
      <PageHeader />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-border bg-surface p-4"
          >
            <Block className="h-3 w-20" />
            <Block className="h-6 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <Block className="h-4 w-36" />
          <Block className="h-48 w-full" />
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <Block className="h-4 w-28" />
          <Block className="h-12 w-full" />
          <Block className="h-12 w-full" />
          <Block className="h-12 w-full" />
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
