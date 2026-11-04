import { LoadError } from "@/components/load-error";
import { SubmitButton } from "@/components/submit-button";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMonthlyBills } from "@/lib/actions";
import {
  displayBillStatus as displayStatus,
  toDateString,
} from "@/lib/billing";
import { pickVisibleBills } from "@/lib/bill-history";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PaginationControls } from "@/components/pagination-controls";
import { parsePage, getRange, getTotalPages } from "@/lib/pagination";
import {
  RoomBillingModal,
  type ModalBillRow,
  type ModalUtilityBill,
} from "@/components/room-billing-modal";
import { BedDouble, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";

// How many bills per tenant (rent) / per room (utility) a room's pop-up shows.
// Every UNPAID bill is always shown on top of this (see lib/bill-history.ts),
// and a tenant's full history is one click away on their own, paginated, page.
const HISTORY_CAP = 8;

type StatusFilter = "all" | "outstanding" | "paid";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    page?: string;
    q?: string;
    status?: string;
    room?: string;
  }>;
}) {
  const {
    error,
    saved,
    page: pageParam,
    q,
    status: statusParam,
    room: openRoomId,
  } = await searchParams;
  const page = parsePage(pageParam);
  const statusFilter: StatusFilter = ["outstanding", "paid"].includes(
    statusParam ?? ""
  )
    ? (statusParam as StatusFilter)
    : "all";

  const session = await getSessionUser();

  if (!session) redirect("/");

  if (session.profile?.role !== "owner") {
    redirect("/tenant");
  }

  const dormId = session.profile.dorm_id;

  if (!dormId) {
    redirect("/admin?error=No+dormitory+assigned");
  }

  const supabase = createAdminClient();

  // ============================================================
  // LOAD ROOMS, TENANTS, AND THE UNPAID BILLS
  //
  // The list of rooms is grouped, filtered and paged in memory -- rooms are
  // bounded by the size of the building. What is NOT bounded is billing
  // history, which grows every month, so this loads only the UNPAID bills
  // (all a room's "₱X due" needs). The pop-up history for the rooms actually
  // on screen is loaded separately below.
  // ============================================================

  const [
    { data: rooms, error: roomsError },
    { data: tenants, error: tenantsError },
    { data: bills, error: billsError },
    { data: utilityBills, error: utilityBillsError },
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, room_number, capacity, monthly_rate")
      .eq("dorm_id", dormId)
      .order("room_number"),
    supabase
      .from("tenants")
      .select("id, full_name, room_id, status")
      .eq("dorm_id", dormId)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("bills")
      .select(
        "id, tenant_id, room_id, due_date, rent_amount, other_charges, charges_note, total_amount, amount_paid, status"
      )
      .eq("dorm_id", dormId)
      .neq("status", "paid")
      .order("due_date", { ascending: false }),
    supabase
      .from("utility_bills")
      .select(
        "id, room_id, due_date, water_amount, electricity_amount, total_amount, amount_paid, status, notes"
      )
      .eq("dorm_id", dormId)
      .neq("status", "paid")
      .order("due_date", { ascending: false }),
  ]);

  const loadError =
    roomsError?.message ||
    tenantsError?.message ||
    billsError?.message ||
    utilityBillsError?.message ||
    null;

  if (loadError) {
    console.error("Could not load billing data:", loadError);
    return (
      <main className="flex-1 bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-3xl">
          <LoadError what="billing data" />
        </div>
      </main>
    );
  }

  // ============================================================
  // GROUP BY ROOM
  // ============================================================

  const tenantsByRoom = new Map<string, typeof tenants>();
  for (const tenant of tenants ?? []) {
    if (!tenant.room_id) continue;
    const list = tenantsByRoom.get(tenant.room_id) ?? [];
    list.push(tenant);
    tenantsByRoom.set(tenant.room_id, list);
  }

  const billsByTenant = new Map<string, ModalBillRow[]>();
  for (const bill of bills ?? []) {
    const list = billsByTenant.get(bill.tenant_id) ?? [];
    list.push(bill);
    billsByTenant.set(bill.tenant_id, list);
  }

  const utilityBillsByRoom = new Map<string, ModalUtilityBill[]>();
  for (const bill of utilityBills ?? []) {
    if (!bill.room_id) continue;
    const list = utilityBillsByRoom.get(bill.room_id) ?? [];
    list.push(bill);
    utilityBillsByRoom.set(bill.room_id, list);
  }

  const needle = (q ?? "").trim().toLowerCase();

  const roomSummaries = (rooms ?? []).map((room) => {
    const roomTenants = tenantsByRoom.get(room.id) ?? [];
    const roomUtilityBills = utilityBillsByRoom.get(room.id) ?? [];

    const allTenantBills = roomTenants.flatMap(
      (t) => billsByTenant.get(t.id) ?? []
    );

    const hasOutstanding =
      allTenantBills.some((b) => displayStatus(b) !== "paid") ||
      roomUtilityBills.some((b) => displayStatus(b) !== "paid");

    const outstandingAmount =
      allTenantBills.reduce(
        (sum, b) =>
          displayStatus(b) !== "paid"
            ? sum + (Number(b.total_amount) - Number(b.amount_paid))
            : sum,
        0
      ) +
      roomUtilityBills.reduce(
        (sum, b) =>
          displayStatus(b) !== "paid"
            ? sum + (Number(b.total_amount) - Number(b.amount_paid))
            : sum,
        0
      );

    const haystack = [
      room.room_number,
      ...roomTenants.map((t) => t.full_name),
    ]
      .join(" ")
      .toLowerCase();

    return {
      room,
      tenants: roomTenants,
      utilityBills: roomUtilityBills,
      hasOutstanding,
      outstandingAmount,
      haystack,
    };
  });

  // "N bill(s) still outstanding" header, across every room regardless
  // of the current filter/page -- same semantics the old flat list used.
  const outstandingRoomCount = roomSummaries.filter(
    (r) => r.hasOutstanding
  ).length;

  const filteredRooms = roomSummaries.filter((r) => {
    if (needle && !r.haystack.includes(needle)) return false;
    if (statusFilter === "outstanding" && !r.hasOutstanding) return false;
    if (statusFilter === "paid" && r.hasOutstanding) return false;
    return true;
  });

  const totalPages = getTotalPages(filteredRooms.length);
  const { from: pageFrom, to: pageTo } = getRange(page);
  const pageRooms = filteredRooms.slice(pageFrom, pageTo + 1);

  // ============================================================
  // HISTORY FOR THE ROOMS ON SCREEN ONLY
  //
  // The pop-ups need some paid history to sit under the unpaid bills. Fetch
  // just the last 12 months of paid bills, and only for the tenants/rooms on
  // this page (at most 10 rooms), then let pickVisibleBills decide what shows.
  // ============================================================
  const now = new Date();
  const historyCutoff = toDateString(
    new Date(now.getFullYear(), now.getMonth() - 11, 1)
  );
  const pageTenantIds = pageRooms.flatMap((r) => r.tenants.map((t) => t.id));
  const pageRoomIds = pageRooms.map((r) => r.room.id);

  const [
    { data: paidBills, error: paidBillsError },
    { data: paidUtilityBills, error: paidUtilityError },
  ] = await Promise.all([
    pageTenantIds.length
      ? supabase
          .from("bills")
          .select(
            "id, tenant_id, room_id, due_date, rent_amount, other_charges, charges_note, total_amount, amount_paid, status"
          )
          .in("tenant_id", pageTenantIds)
          .eq("status", "paid")
          .gte("due_date", historyCutoff)
          .order("due_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    pageRoomIds.length
      ? supabase
          .from("utility_bills")
          .select(
            "id, room_id, due_date, water_amount, electricity_amount, total_amount, amount_paid, status, notes"
          )
          .in("room_id", pageRoomIds)
          .eq("status", "paid")
          .gte("due_date", historyCutoff)
          .order("due_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (paidBillsError || paidUtilityError) {
    console.error("Could not load billing history:", paidBillsError ?? paidUtilityError);
    return (
      <main className="flex-1 bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-3xl">
          <LoadError what="billing history" />
        </div>
      </main>
    );
  }

  const modalBillsByTenant = new Map<string, ModalBillRow[]>();
  for (const room of pageRooms) {
    for (const t of room.tenants) {
      const paid = (paidBills ?? []).filter((b) => b.tenant_id === t.id);
      modalBillsByTenant.set(
        t.id,
        pickVisibleBills([...(billsByTenant.get(t.id) ?? []), ...paid], HISTORY_CAP)
      );
    }
  }

  const modalUtilityByRoom = new Map<string, ModalUtilityBill[]>();
  for (const room of pageRooms) {
    const paid = (paidUtilityBills ?? []).filter((b) => b.room_id === room.room.id);
    modalUtilityByRoom.set(
      room.room.id,
      pickVisibleBills([...room.utilityBills, ...paid], HISTORY_CAP)
    );
  }

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/billing${qs ? `?${qs}` : ""}`;
  }

  const redirectState = {
    q: q ?? "",
    status: statusFilter === "all" ? "" : statusFilter,
    page: String(page),
  };

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="mb-6">
          <h1 className="font-heading text-lg font-semibold text-primary">
            Billing
          </h1>

          <p className="text-xs text-foreground-muted">
            {outstandingRoomCount === 0
              ? "Every room is paid up."
              : `${outstandingRoomCount} room(s) with an outstanding balance.`}
          </p>
        </div>

        {/* ======================================================
            ERROR / SUCCESS
        ====================================================== */}

        {error && (
          <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
            {saved === "1" ? "Saved." : saved}
          </div>
        )}

        {/* ======================================================
            GENERATE MONTHLY BILLS
        ====================================================== */}

        <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-surface p-6">
          <div>
            <p className="font-heading text-sm font-semibold">
              Generate this month&apos;s bills
            </p>

            <p className="text-xs text-foreground-muted">
              Creates one bill per room-assigned tenant using their room&apos;s
              monthly rate. Tenants already billed this period are skipped.
            </p>
          </div>

          <form action={generateMonthlyBills}>
            <SubmitButton className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90">
              Generate
            </SubmitButton>
          </form>
        </div>

        {/* ======================================================
            FILTERS
        ====================================================== */}

        <AutoSubmitForm
          action="/admin/billing"
          className="mb-6 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search room or tenant…"
            className={`${inputClass} max-w-xs`}
          />

          <select
            name="status"
            defaultValue={statusFilter}
            className={`${inputClass} w-auto`}
          >
            <option value="all">All rooms</option>
            <option value="outstanding">Outstanding</option>
            <option value="paid">Paid up</option>
          </select>
        </AutoSubmitForm>

        {/* ======================================================
            ROOMS
        ====================================================== */}

        <div className="space-y-3">
          {pageRooms.length === 0 && (
            <EmptyState
              bordered
              icon={BedDouble}
              title={roomSummaries.length === 0 ? "No rooms yet" : "No rooms match your filters"}
              description={
                roomSummaries.length === 0
                  ? "Bills are created per room, so add a room and assign tenants first."
                  : "Try a different search or filter."
              }
              action={
                roomSummaries.length === 0
                  ? { label: "Add a room", href: "/admin/rooms#add-room" }
                  : undefined
              }
            />
          )}

          {pageRooms.map(({ room, tenants: roomTenants, hasOutstanding, outstandingAmount }) => (
            <RoomBillingModal
              key={room.id}
              roomId={room.id}
              roomNumber={room.room_number}
              tenants={roomTenants.map((t) => ({
                id: t.id,
                full_name: t.full_name,
                bills: modalBillsByTenant.get(t.id) ?? [],
              }))}
              utilityBills={modalUtilityByRoom.get(room.id) ?? []}
              redirectState={redirectState}
              defaultOpen={openRoomId === room.id}
              trigger={
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/40">
                  <div>
                    <p className="font-heading text-sm font-semibold">
                      Room {room.room_number}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {roomTenants.length > 0
                        ? roomTenants.map((t) => t.full_name).join(", ")
                        : "No tenants assigned"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {hasOutstanding ? (
                      <span className="rounded-full bg-status-overdue/15 px-2.5 py-0.5 text-xs font-medium text-status-overdue">
                        ₱{outstandingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} due
                      </span>
                    ) : (
                      <span className="rounded-full bg-status-paid/15 px-2.5 py-0.5 text-xs font-medium text-status-paid">
                        Paid up
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-foreground-muted" />
                  </div>
                </div>
              }
            />
          ))}
        </div>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          hrefForPage={pageHref}
        />
      </div>
    </main>
  );
}
