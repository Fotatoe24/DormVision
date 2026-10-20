import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getInvoiceData } from "@/lib/invoices";
import { InvoiceDocument } from "@/components/invoice-document";
import { InvoiceActions } from "@/components/invoice-actions";
import { FileX } from "lucide-react";

// Standalone route (no AdminShell/TenantShell nav chrome), same
// pattern as app/receipts/[id] -- shared by both tenant and owner,
// authorization decided entirely by getInvoiceData, not by which
// section of the app linked here.
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionUser();

  if (!session) redirect("/");

  const result = await getInvoiceData(id);

  const backHref = session.profile?.role === "owner" ? "/admin/billing" : "/tenant";
  const backLabel =
    session.profile?.role === "owner" ? "Back to billing" : "Back to dashboard";

  if (!result.ok) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <FileX className="mx-auto mb-4 h-10 w-10 text-foreground-muted" />
          <p className="mb-6 text-sm text-foreground-muted">
            This invoice isn&apos;t available, or you don&apos;t have access
            to it.
          </p>
          <a
            href={backHref}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
          >
            {backLabel}
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6 print:bg-white print:p-0">
      <InvoiceActions billId={id} backHref={backHref} backLabel={backLabel} />
      <InvoiceDocument data={result.data} />
    </main>
  );
}
