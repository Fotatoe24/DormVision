import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";

export type ReceiptLineItem = {
  label: string;
  amount: number;
};

export type ReceiptData = {
  receiptNumber: string;
  issuedAt: string;
  dorm: {
    name: string;
    address: string | null;
    contactNumber: string | null;
    email: string | null;
  };
  tenant: { fullName: string };
  room: { roomNumber: string | null };
  billingPeriod: { start: string; end: string; dueDate: string };
  lineItems: ReceiptLineItem[];
  billTotal: number;
  billAmountPaidCumulative: number;
  billRemaining: number;
  payment: {
    amount: number;
    method: string;
    paidAt: string;
    notes: string | null;
    status: "confirmed";
  };
};

export type ReceiptResult =
  | { ok: true; data: ReceiptData }
  | {
      ok: false;
      reason: "unauthenticated" | "not_found" | "forbidden" | "not_confirmed";
    };

// Single source of truth for "can this session see this payment's
// receipt, and what does it say" -- used by both app/receipts/[id]
// (the HTML preview) and app/api/receipts/[id]/pdf (the download), so
// the two can never disagree about authorization or content. Never
// trusts the paymentId beyond using it to look the row up; every
// authorization decision is made from session data + what's actually
// stored against that row, never from anything the client asserts.
export async function getReceiptData(
  paymentId: string
): Promise<ReceiptResult> {
  const session = await getSessionUser();
  if (!session) {
    return { ok: false, reason: "unauthenticated" };
  }

  const admin = createAdminClient();

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select(
      `
      id,
      bill_id,
      tenant_id,
      amount,
      method,
      paid_at,
      notes,
      status,
      receipt_number,
      bills (
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
        amount_paid
      )
      `
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    return { ok: false, reason: "not_found" };
  }

  const billRel = payment.bills as
    | {
        id: string;
        tenant_id: string;
        room_id: string | null;
        dorm_id: string | null;
        billing_period_start: string;
        billing_period_end: string;
        due_date: string;
        rent_amount: number | string;
        other_charges: number | string;
        total_amount: number | string;
        amount_paid: number | string;
      }
    | {
        id: string;
        tenant_id: string;
        room_id: string | null;
        dorm_id: string | null;
        billing_period_start: string;
        billing_period_end: string;
        due_date: string;
        rent_amount: number | string;
        other_charges: number | string;
        total_amount: number | string;
        amount_paid: number | string;
      }[]
    | null;
  const bill = Array.isArray(billRel) ? billRel[0] : billRel;

  if (!bill) {
    return { ok: false, reason: "not_found" };
  }

  // ----------------------------------------------------------
  // Authorization -- an owner only sees payments whose bill belongs
  // to a dorm they own; a tenant only sees payments that are their
  // own (by tenants.id, resolved server-side from their session,
  // never taken from the client). Any other role, or no match, is a
  // flat forbidden -- never a silent redirect that could be mistaken
  // for "not found" by someone probing IDs.
  // ----------------------------------------------------------
  if (session.profile?.role === "owner") {
    if (!session.profile.dorm_id || bill.dorm_id !== session.profile.dorm_id) {
      return { ok: false, reason: "forbidden" };
    }
  } else if (session.profile?.role === "tenant") {
    // A tenant can have several tenants rows (one per dorm they've lived
    // in), and receipts from past stays must stay viewable -- so match
    // against all of their own, not just the current one.
    const { data: ownTenancies } = await admin
      .from("tenants")
      .select("id")
      .eq("profile_id", session.user.id);

    if (!(ownTenancies ?? []).some((t) => t.id === payment.tenant_id)) {
      return { ok: false, reason: "forbidden" };
    }
  } else {
    return { ok: false, reason: "forbidden" };
  }

  // Only a confirmed payment is a real, settled transaction -- a
  // pending report or a rejected one never gets a receipt, regardless
  // of role.
  if (payment.status !== "confirmed") {
    return { ok: false, reason: "not_confirmed" };
  }

  // ----------------------------------------------------------
  // Mint (or retrieve) the stable receipt number. Idempotent: see
  // migration 0015's get_or_create_receipt_number -- a payment that
  // already has one just gets it back unchanged.
  // ----------------------------------------------------------
  let receiptNumber = payment.receipt_number as string | null;
  if (!receiptNumber) {
    const { data: minted, error: rpcError } = await admin.rpc(
      "get_or_create_receipt_number",
      { p_payment_id: payment.id }
    );

    if (rpcError || !minted) {
      return { ok: false, reason: "not_found" };
    }

    receiptNumber = minted as string;
  }

  const [{ data: tenant }, { data: room }, { data: dorm }] = await Promise.all([
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
  ]);

  const lineItems: ReceiptLineItem[] = [
    { label: "Rent", amount: Number(bill.rent_amount) },
  ];
  if (Number(bill.other_charges) > 0) {
    lineItems.push({
      label: "Other charges",
      amount: Number(bill.other_charges),
    });
  }

  const data: ReceiptData = {
    receiptNumber,
    issuedAt: payment.paid_at,
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
    billTotal: Number(bill.total_amount),
    billAmountPaidCumulative: Number(bill.amount_paid),
    billRemaining: Number(bill.total_amount) - Number(bill.amount_paid),
    payment: {
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paid_at,
      notes: payment.notes,
      status: "confirmed",
    },
  };

  return { ok: true, data };
}
