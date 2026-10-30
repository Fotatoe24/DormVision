import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenancy } from "@/lib/tenant-status";
import { notifyOwnerPaymentReported } from "@/lib/notifications";
import {
  MAX_PROOF_BYTES,
  PROOF_BUCKET,
  PROOF_REQUIRED_METHODS,
  buildProofPath,
} from "@/lib/payment-proofs";
import { sniffImageType } from "@/lib/image-files";

const VALID_METHODS = ["cash", "bank_transfer", "gcash", "other"];

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// ---------------------------------------------------------
// POST /api/payments/report   (multipart/form-data)
//   billId  - the bill being paid
//   method  - cash | bank_transfer | gcash | other
//   proof   - optional image (required for gcash / bank_transfer)
//
// The tenant's "I've Paid" action, now able to carry a receipt image. It is
// a route handler rather than a server action because the image is posted
// from the browser with upload progress, and because server actions cap
// request bodies at 1 MB by default.
//
// The browser compresses the image once before sending (see
// components/payment-report-form.tsx); nothing here re-encodes it. What the
// server DOES do, since the client can't be trusted, is re-check size, real
// file type (by signature), and that the bill is the caller's own.
// ---------------------------------------------------------
export async function POST(request: Request) {
  const session = await getSessionUser();

  if (!session) return fail("Not signed in.", 401);
  if (session.profile?.role !== "tenant") {
    return fail("Only tenants can report a payment.", 403);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return fail("Invalid request.", 400);

  const billId = String(form.get("billId") ?? "").trim();
  const rawMethod = String(form.get("method") ?? "cash").trim();
  const method = VALID_METHODS.includes(rawMethod) ? rawMethod : "cash";
  const proof = form.get("proof");

  if (!billId) return fail("Bill ID is required.", 400);

  // Their live tenancy, never one for a dorm they've moved out of.
  const tenancy = await getCurrentTenancy(session.user.id);

  if (!tenancy || tenancy.status === "moved_out") {
    return fail("Tenant record not found.", 403);
  }

  const admin = createAdminClient();

  const { data: bill, error: billError } = await admin
    .from("bills")
    .select("id, total_amount, amount_paid")
    .eq("id", billId)
    .eq("tenant_id", tenancy.id)
    .single();

  if (billError || !bill) return fail("Bill not found.", 404);

  const remaining = Number(bill.total_amount) - Number(bill.amount_paid);

  if (remaining <= 0) return fail("This bill is already fully paid.", 400);

  // Checked here for a clear message; migration 0011's partial unique index
  // (one pending row per bill) is the real backstop under a race.
  const { data: existingPending } = await admin
    .from("payments")
    .select("id")
    .eq("bill_id", bill.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return fail(
      "You already have a payment report pending review for this bill.",
      409
    );
  }

  // ---- proof: present / required / valid --------------------------------
  const hasProof = proof instanceof File && proof.size > 0;

  if (!hasProof && PROOF_REQUIRED_METHODS.includes(method)) {
    return fail(
      "Please attach a screenshot or photo of your payment for GCash and bank transfers.",
      400
    );
  }

  let proofBytes: Uint8Array | null = null;
  let proofType: ReturnType<typeof sniffImageType> = null;

  if (hasProof) {
    if (proof.size > MAX_PROOF_BYTES) {
      return fail("That image is too large. The limit is 2 MB.", 413);
    }

    proofBytes = new Uint8Array(await proof.arrayBuffer());
    proofType = sniffImageType(proofBytes);

    if (!proofType) {
      return fail("Please upload a JPEG, PNG or WebP image.", 415);
    }
  }

  // ---- create the report -------------------------------------------------
  const { data: payment, error: insertError } = await admin
    .from("payments")
    .insert({
      bill_id: bill.id,
      tenant_id: tenancy.id,
      amount: remaining,
      method,
      paid_at: new Date().toISOString(),
      recorded_by: session.user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    // 23505 = the one-pending-per-bill unique index lost a race.
    if (insertError?.code === "23505") {
      return fail(
        "You already have a payment report pending review for this bill.",
        409
      );
    }
    return fail(
      "Could not submit payment report: " +
        (insertError?.message ?? "unknown error"),
      500
    );
  }

  // ---- store the proof (rolling the report back if it can't be) ----------
  if (proofBytes && proofType) {
    // A new, timestamped file every time -- never an upsert over an old one.
    const path = buildProofPath(tenancy.id, payment.id, proofType);

    const { error: uploadError } = await admin.storage
      .from(PROOF_BUCKET)
      .upload(path, proofBytes, {
        contentType: proofType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Payment proof upload failed:", uploadError);
      await admin.from("payments").delete().eq("id", payment.id);
      return fail(
        "Could not upload your proof, so the payment wasn't reported. Please try again.",
        500
      );
    }

    const { error: pathError } = await admin
      .from("payments")
      .update({ proof_path: path })
      .eq("id", payment.id);

    if (pathError) {
      console.error("Could not save proof path:", pathError);
      await admin.storage.from(PROOF_BUCKET).remove([path]);
      await admin.from("payments").delete().eq("id", payment.id);
      return fail(
        "Could not save your proof, so the payment wasn't reported. Please try again.",
        500
      );
    }
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  after(() =>
    notifyOwnerPaymentReported(origin, tenancy.id, remaining, method, hasProof)
  );

  revalidatePath("/tenant/billing");
  revalidatePath("/admin/payments");

  return NextResponse.json({ ok: true });
}
