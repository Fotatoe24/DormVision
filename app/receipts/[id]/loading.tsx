export default function ReceiptLoading() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-2xl animate-pulse space-y-4">
        <div className="h-8 w-40 rounded bg-surface-muted" />
        <div className="h-64 rounded-lg border border-border bg-surface" />
      </div>
    </main>
  );
}
