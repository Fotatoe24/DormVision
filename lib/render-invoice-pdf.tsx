import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdfDocument } from "@/components/invoice-pdf-document";
import type { InvoiceData } from "@/lib/invoices";

// Counterpart to lib/render-receipt-pdf.tsx -- same file-naming
// constraint reason (a Next.js route handler must be route.ts/.js,
// and a plain .ts can't contain JSX), kept to a single exported
// function so the route stays a clean .ts file.
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument data={data} />);
}
