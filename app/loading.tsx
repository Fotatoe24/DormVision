// Root loading state — shown while any page below the root layout is
// fetching data server-side, in place of a fully blocked blank screen.
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}
