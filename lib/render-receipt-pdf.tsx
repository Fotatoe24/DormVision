import { renderToBuffer } from "@react-pdf/renderer";
import { ReceiptPdfDocument } from "@/components/receipt-pdf-document";
import type { ReceiptData } from "@/lib/receipts";

// Lives in its own .tsx module (not inlined into app/api/receipts/
// [id]/pdf/route.ts) purely because of a file-naming constraint: a
// Next.js route handler must be named exactly route.ts/route.js, and
// a plain .ts file can't contain JSX -- this is the one place that
// needs it, kept to a single exported function so the route stays a
// clean .ts file.
export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return renderToBuffer(<ReceiptPdfDocument data={data} />);
}
