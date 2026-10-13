function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-muted ${className}`}
      aria-hidden="true"
    />
  );
}

export default function TenantLoading() {
  return (
    <div
      className="mx-auto max-w-3xl"
      role="status"
      aria-label="Loading your dashboard"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-5 w-40" />
          <Block className="h-3 w-52" />
        </div>
        <Block className="h-3 w-16" />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <Block className="mb-2 h-3 w-28" />
          <Block className="mb-3 h-9 w-32" />
          <Block className="h-9 w-28" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <Block className="mb-3 h-3 w-24" />
          <Block className="h-5 w-32" />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6 space-y-2">
          <Block className="h-3 w-32" />
          <Block className="h-4 w-24" />
          <Block className="h-4 w-full" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 space-y-2">
          <Block className="h-3 w-28" />
          <Block className="h-4 w-full" />
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <Block className="h-3 w-32" />
        </div>
        <div className="space-y-3 p-6">
          <Block className="h-10 w-full" />
          <Block className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
