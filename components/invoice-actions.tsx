"use client";

import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";

export function InvoiceActions({
  billId,
  backHref,
  backLabel,
}: {
  billId: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-2xl items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>

        <a
          href={`/api/invoices/${billId}/pdf`}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>
    </div>
  );
}
