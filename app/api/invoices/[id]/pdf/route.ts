import { NextResponse } from "next/server";
import { getInvoiceData } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/render-invoice-pdf";

// GET /api/invoices/[id]/pdf -- authorizes exactly the same way the
// HTML preview at app/invoices/[id] does (both call getInvoiceData),
// so there is no separate, looser path to an invoice's PDF than to
// its on-screen preview. The bill id in the URL is never trusted
// beyond using it to look the row up.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getInvoiceData(id);

  if (!result.ok) {
    const status =
      result.reason === "unauthenticated"
        ? 401
        : result.reason === "forbidden"
        ? 403
        : 404;

    return NextResponse.json({ error: result.reason }, { status });
  }

  const buffer = await renderInvoicePdf(result.data);
  const filename = `DormVision-Invoice-${result.data.invoiceNumber}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
