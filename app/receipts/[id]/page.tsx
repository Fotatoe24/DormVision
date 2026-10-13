import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getReceiptData } from "@/lib/receipts";
import { ReceiptDocument } from "@/components/receipt-document";
import { ReceiptActions } from "@/components/receipt-actions";
import { FileX, Clock } from "lucide-react";

// Standalone route (no AdminShell/TenantShell nav chrome) shared by
// both tenant and owner -- which one a given payment ID is visible to
// is decided entirely by getReceiptData's authorization check, not by
// which section of the app linked here. Deliberately outside
// app/admin and app/tenant so printing/PDF output isn't fighting the
// sidebar and fixed bottom nav; see the earlier design decision this
// followed.
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionUser();

  if (!session) redirect("/");

  const result = await getReceiptData(id);

  const backHref = session.profile?.role === "owner" ? "/admin/payments" : "/tenant";
  const backLabel =
    session.profile?.role === "owner" ? "Back to payments" : "Back to dashboard";

  if (!result.ok) {
    const message =
      result.reason === "not_confirmed"
        ? "This payment hasn't been confirmed yet, so there's no receipt for it."
        : "This receipt isn't available, or you don't have access to it.";

    const Icon = result.reason === "not_confirmed" ? Clock : FileX;

    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <Icon className="mx-auto mb-4 h-10 w-10 text-foreground-muted" />
          <p className="mb-6 text-sm text-foreground-muted">{message}</p>
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
      <ReceiptActions paymentId={id} backHref={backHref} backLabel={backLabel} />
      <ReceiptDocument data={result.data} />
    </main>
  );
}
