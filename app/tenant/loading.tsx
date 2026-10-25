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
      className="mx-auto max-w-2xl"
      role="status"
      aria-label="Loading your dashboard"
    >
      <Block className="mb-4 h-4 w-32" />
      <div className="mb-6 rounded-lg border border-border bg-surface p-6 space-y-2">
        <Block className="h-3 w-24" />
        <Block className="h-4 w-40" />
      </div>
      <div className="rounded-lg border border-border bg-surface p-6 space-y-3">
        <Block className="h-3 w-20" />
        <Block className="h-20 w-full" />
        <Block className="h-20 w-full" />
      </div>
    </div>
  );
}
