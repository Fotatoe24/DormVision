"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function ToastListenerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const error = searchParams.get("error");
    const saved = searchParams.get("saved");

    if (!error && !saved) return;

    if (error) toast.error(error);
    if (saved) toast.success("Saved.");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    params.delete("saved");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

// Wrapped in Suspense because useSearchParams() requires it in the
// App Router — this keeps every page that uses ToastListener from
// having to think about that.
export function ToastListener() {
  return (
    <Suspense fallback={null}>
      <ToastListenerInner />
    </Suspense>
  );
}
