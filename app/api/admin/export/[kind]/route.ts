import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyLateFees } from "@/lib/late-fees";
import { getGraceDays } from "@/lib/shell-data";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseExportKind } from "@/lib/export/filters";
import { buildExport } from "@/lib/export/datasets";
import { buildWorkbook } from "@/lib/export/workbook";

// Downloads an owner's data as an Excel (.xlsx) file, for the filters in the
// query string. Owner only, and only ever their own dormitory: the dorm comes
// from the signed-in session, never from the request.
//
//   GET /api/admin/export/payments?from=2026-11-01&to=2026-11-30&method=gcash
//   GET /api/admin/export/income-expenses?range=last_month&category=utilities
//   GET /api/admin/export/bills?status=overdue
//   GET /api/admin/export/tenants?payment=unpaid
//   GET /api/admin/export/rooms

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const session = await getSessionUser();

  if (!session) return fail("Please sign in again.", 401);
  if (session.profile?.role !== "owner" || !session.profile.dorm_id) {
    return fail("Only a dorm owner can export data.", 403);
  }

  const kind = parseExportKind((await params).kind);
  if (!kind) return fail("Unknown export.", 404);

  const dormId = session.profile.dorm_id;
  const admin = createAdminClient();

  // A big export is real work for the database; a stuck button or a script
  // shouldn't be able to hammer it.
  const limit = await checkRateLimit(admin, `export:${session.user.id}`, 20, 10 * 60);
  if (!limit.allowed) {
    return fail("You're exporting too fast. Please wait a few minutes and try again.", 429);
  }

  try {
    const { data: dorm } = await admin
      .from("dormitories")
      .select("name")
      .eq("id", dormId)
      .maybeSingle();

    // Same as the pages: charge any late fee that is now due before reading bills.
    await applyLateFees(dormId);

    const result = await buildExport(kind, {
      admin,
      dormId,
      dormName: dorm?.name ?? "Dormitory",
      graceDays: await getGraceDays(dormId),
      params: new URL(request.url).searchParams,
    });

    const file = await buildWorkbook(result.sheets);

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": String(file.length),
        // Financial data: never stored by a browser cache or a shared proxy.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`Export "${kind}" failed:`, error);
    return fail("We couldn't create the export. Please try again.", 500);
  }
}
