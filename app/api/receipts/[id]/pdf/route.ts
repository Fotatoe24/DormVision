import { NextResponse } from "next/server";
import { getReceiptData } from "@/lib/receipts";
import { renderReceiptPdf } from "@/lib/render-receipt-pdf";

// GET /api/receipts/[id]/pdf -- authorizes exactly the same way the
// HTML preview at app/receipts/[id] does (both call getReceiptData,
// the single source of truth for who can see what), so there is no
// separate, looser path to a receipt's PDF than to its on-screen
// preview. The payment id in the URL is never trusted beyond using it
// to look the row up -- every authorization decision comes from the
// session + what's actually stored against that row.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getReceiptData(id);

  if (!result.ok) {
    const status =
      result.reason === "unauthenticated"
        ? 401
        : result.reason === "forbidden"
        ? 403
        : result.reason === "not_confirmed"
        ? 409
        : 404;

    return NextResponse.json({ error: result.reason }, { status });
  }

  const buffer = await renderReceiptPdf(result.data);
  const filename = `DormVision-Receipt-${result.data.receiptNumber}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
