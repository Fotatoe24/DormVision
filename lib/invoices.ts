import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { displayBillStatus } from "@/lib/billing";

export type InvoiceLineItem = {
  label: string;
  amount: number;
};

export type InvoicePayment = {
  amount: number;
  method: string;
  paidAt: string;
};

export type InvoiceData = {
  invoiceNumber: string;
  issuedAt: string;
  status: string;
  dorm: {
    name: string;
    address: string | null;
    contactNumber: string | null;
    email: string | null;
  };
  tenant: { fullName: string };
  room: { roomNumber: string | null };
  billingPeriod: { start: string; end: string; dueDate: string };
  lineItems: InvoiceLineItem[];
  total: number;
  amountPaid: number;
  balanceDue: number;
  payments: InvoicePayment[];
};

export type InvoiceResult =
  | { ok: true; data: InvoiceData }
  | { ok: false; reason: "unauthenticated" | "not_found" | "forbidden" };

// Counterpart to lib/receipts.ts's getReceiptData -- single source of
// truth for "can this session see this bill's invoice, and what does
// it say" -- used by both app/invoices/[id] (the HTML preview) and
// app/api/invoices/[id]/pdf (the download). Never trusts the billId
// beyond using it to look the row up; every authorization decision is
// made from session data + what's actually stored against the row.
//
// Unlike a receipt, there is no "not_confirmed" rejection -- an
// invoice is a record of what a bill charges, available at any
// payment status (unpaid, partial, or paid).
export async function getInvoiceData(billId: string): Promise<InvoiceResult> {
  const session = await getSessionUser();
  if (!session) {
    return { ok: false, reason: "unauthenticated" };
  }

  const admin = createAdminClient();

  const { data: bill, error: billError } = await admin
    .from("bills")
    .select(
      `
      id,
      tenant_id,
      room_id,
      dorm_id,
      billing_period_start,
      billing_period_end,
      due_date,
      rent_amount,
      other_charges,
      total_amount,
      amount_paid,
      status,
      created_at,
      invoice_number
      `
    )
    .eq("id", billId)
    .maybeSingle();

  if (billError || !bill) {
    return { ok: false, reason: "not_found" };
  }

  // ----------------------------------------------------------
  // Authorization -- same shape as getReceiptData: an owner only sees
  // invoices for bills in a dorm they own; a tenant only sees invoices
  // for their own bills (by tenants.id, resolved server-side from
  // their session, never taken from the client).
  // ----------------------------------------------------------
  if (session.profile?.role === "owner") {
    if (!session.profile.dorm_id || bill.dorm_id !== session.profile.dorm_id) {
      return { ok: false, reason: "forbidden" };
    }
  } else if (session.profile?.role === "tenant") {
    // A tenant can have several tenants rows (one per dorm they've lived
    // in), and invoices from past stays must stay viewable -- so match
    // against all of their own, not just the current one.
    const { data: ownTenancies } = await admin
      .from("tenants")
      .select("id")
      .eq("profile_id", session.user.id);

    if (!(ownTenancies ?? []).some((t) => t.id === bill.tenant_id)) {
      return { ok: false, reason: "forbidden" };
    }
  } else {
    return { ok: false, reason: "forbidden" };
  }

  // ----------------------------------------------------------
  // Mint (or retrieve) the stable invoice number. Idempotent: see
  // migration 0016's get_or_create_invoice_number.
  // ----------------------------------------------------------
  let invoiceNumber = bill.invoice_number as string | null;
  if (!invoiceNumber) {
    const { data: minted, error: rpcError } = await admin.rpc(
      "get_or_create_invoice_number",
      { p_bill_id: bill.id }
    );

    if (rpcError || !minted) {
      return { ok: false, reason: "not_found" };
    }

    invoiceNumber = minted as string;
  }

  const [{ data: tenant }, { data: room }, { data: dorm }, { data: payments }] =
    await Promise.all([
      admin
        .from("tenants")
        .select("full_name")
        .eq("id", bill.tenant_id)
        .maybeSingle(),
      bill.room_id
        ? admin.from("rooms").select("room_number").eq("id", bill.room_id).maybeSingle()
        : Promise.resolve({ data: null }),
      bill.dorm_id
        ? admin
            .from("dormitories")
            .select("name, address, contact_number, email")
            .eq("id", bill.dorm_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("payments")
        .select("amount, method, paid_at")
        .eq("bill_id", bill.id)
        .eq("status", "confirmed")
        .order("paid_at", { ascending: true }),
    ]);

  const lineItems: InvoiceLineItem[] = [
    { label: "Rent", amount: Number(bill.rent_amount) },
  ];
  if (Number(bill.other_charges) > 0) {
    lineItems.push({
      label: "Other charges",
      amount: Number(bill.other_charges),
    });
  }

  const data: InvoiceData = {
    invoiceNumber,
    issuedAt: bill.created_at,
    status: displayBillStatus(bill),
    dorm: {
      name: dorm?.name ?? "DormVision",
      address: dorm?.address ?? null,
      contactNumber: dorm?.contact_number ?? null,
      email: dorm?.email ?? null,
    },
    tenant: { fullName: tenant?.full_name ?? "Unknown tenant" },
    room: { roomNumber: room?.room_number ?? null },
    billingPeriod: {
      start: bill.billing_period_start,
      end: bill.billing_period_end,
      dueDate: bill.due_date,
    },
    lineItems,
    total: Number(bill.total_amount),
    amountPaid: Number(bill.amount_paid),
    balanceDue: Number(bill.total_amount) - Number(bill.amount_paid),
    payments: (payments ?? []).map((p) => ({
      amount: Number(p.amount),
      method: p.method,
      paidAt: p.paid_at,
    })),
  };

  return { ok: true, data };
}
