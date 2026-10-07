"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useDismissableOverlay } from "@/components/use-dismissable-overlay";
import {
  billStatusStyles,
  formatMoney,
  formatBillDate,
  displayBillStatus,
} from "@/lib/billing";
import {
  recordPayment,
  createBill,
  deleteBill,
  recordUtilityPayment,
  createUtilityBill,
  deleteUtilityBill,
} from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export type ModalBillRow = {
  id: string;
  due_date: string;
  rent_amount: number | string;
  other_charges: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  charges_note?: string | null;
};

export type ModalTenant = {
  id: string;
  full_name: string;
  bills: ModalBillRow[];
};

export type ModalUtilityBill = {
  id: string;
  due_date: string;
  water_amount: number | string;
  electricity_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  notes?: string | null;
};

// Carries the Billing page's current search/status/page so every
// action inside this modal (mark paid, add bill, delete, ...) can
// redirect back to the same filtered/paginated view with this room's
// modal reopened -- see lib/actions.ts's billingRedirect().
export type BillingRedirectState = {
  q: string;
  status: string;
  page: string;
};

function RedirectFields({
  roomId,
  redirectState,
}: {
  roomId: string;
  redirectState: BillingRedirectState;
}) {
  return (
    <>
      <input type="hidden" name="room" value={roomId} />
      <input type="hidden" name="q" value={redirectState.q} />
      <input type="hidden" name="status" value={redirectState.status} />
      <input type="hidden" name="page" value={redirectState.page} />
    </>
  );
}

export function RoomBillingModal({
  trigger,
  roomId,
  roomNumber,
  tenants,
  utilityBills,
  redirectState,
  defaultOpen = false,
}: {
  trigger: React.ReactNode;
  roomId: string;
  roomNumber: string;
  tenants: ModalTenant[];
  utilityBills: ModalUtilityBill[];
  redirectState: BillingRedirectState;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { overlayRef, closeButtonRef } = useDismissableOverlay({
    open,
    onClose: () => setOpen(false),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`block w-full text-left ${focusRing}`}
      >
        {trigger}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-foreground/30"
          />

          <div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Room ${roomNumber}`}
            className="relative z-10 w-full max-w-2xl rounded-lg border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <p className="font-heading text-sm font-semibold">
                Room {roomNumber}
              </p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className={`flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5">
              {/* ================================================
                  TENANTS & RENT
              ================================================ */}
              <div>
                <p className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Tenants &amp; rent
                </p>

                {tenants.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No tenants assigned to this room.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {tenants.map((tenant) => (
                      <div
                        key={tenant.id}
                        className="rounded-md border border-border p-3"
                      >
                        <p className="mb-2 text-sm font-medium">
                          {tenant.full_name}
                        </p>

                        {tenant.bills.length === 0 ? (
                          <p className="text-xs text-foreground-muted">
                            No bills yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {tenant.bills.map((bill) => {
                              const status = displayBillStatus(bill);
                              const remaining =
                                Number(bill.total_amount) -
                                Number(bill.amount_paid);

                              return (
                                <div
                                  key={bill.id}
                                  className="rounded-md bg-surface-muted p-3 text-xs"
                                >
                                  <div className="mb-1.5 flex items-center justify-between">
                                    <span>
                                      Due {formatBillDate(bill.due_date)}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 font-medium capitalize ${billStatusStyles[status]}`}
                                    >
                                      {status}
                                    </span>
                                  </div>

                                  <div className="mb-1.5 flex items-center justify-between text-foreground-muted">
                                    <span>
                                      Rent {formatMoney(bill.rent_amount)}
                                      {Number(bill.other_charges) > 0 &&
                                        ` + ${formatMoney(bill.other_charges)} other`}
                                    </span>
                                    <span className="font-mono text-accent">
                                      {formatMoney(bill.total_amount)}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between rounded-md bg-background px-2 py-1.5">
                                    <span>
                                      Paid {formatMoney(bill.amount_paid)}
                                    </span>
                                    <span
                                      className={
                                        remaining > 0
                                          ? "text-status-overdue"
                                          : "text-status-paid"
                                      }
                                    >
                                      {remaining > 0
                                        ? `${formatMoney(remaining)} remaining`
                                        : "Fully paid"}
                                    </span>
                                  </div>

                                  {status !== "paid" && (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <form action={recordPayment}>
                                        <input
                                          type="hidden"
                                          name="billId"
                                          value={bill.id}
                                        />
                                        <input
                                          type="hidden"
                                          name="amount"
                                          value={remaining.toFixed(2)}
                                        />
                                        <RedirectFields
                                          roomId={roomId}
                                          redirectState={redirectState}
                                        />
                                        <button
                                          type="submit"
                                          className="rounded-md bg-status-paid px-2.5 py-1 font-medium text-surface hover:opacity-90"
                                        >
                                          Mark as Paid —{" "}
                                          {formatMoney(remaining)}
                                        </button>
                                      </form>

                                      <form
                                        action={recordPayment}
                                        className="flex items-center gap-1.5"
                                      >
                                        <input
                                          type="hidden"
                                          name="billId"
                                          value={bill.id}
                                        />
                                        <RedirectFields
                                          roomId={roomId}
                                          redirectState={redirectState}
                                        />
                                        <input
                                          type="number"
                                          name="amount"
                                          min={0}
                                          step="0.01"
                                          required
                                          placeholder="Amount"
                                          className="w-24 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary"
                                        />
                                        <button
                                          type="submit"
                                          className="rounded-md border border-border px-2.5 py-1 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                                        >
                                          Record
                                        </button>
                                      </form>
                                    </div>
                                  )}

                                  {Number(bill.amount_paid) === 0 && (
                                    <form action={deleteBill} className="mt-2">
                                      <input
                                        type="hidden"
                                        name="billId"
                                        value={bill.id}
                                      />
                                      <RedirectFields
                                        roomId={roomId}
                                        redirectState={redirectState}
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-md border border-status-overdue/30 px-2.5 py-1 text-status-overdue hover:bg-status-overdue/10"
                                      >
                                        Delete
                                      </button>
                                    </form>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <details className="mt-3 rounded-md border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    Add a bill
                  </summary>

                  <form action={createBill} className="mt-3 space-y-3">
                    <RedirectFields
                      roomId={roomId}
                      redirectState={redirectState}
                    />

                    <div>
                      <label
                        htmlFor={`tenantId-${roomId}`}
                        className={labelClass}
                      >
                        Tenant
                      </label>
                      <select
                        id={`tenantId-${roomId}`}
                        name="tenantId"
                        required
                        className={inputClass}
                      >
                        <option value="">Select a tenant…</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>Period start</label>
                        <input
                          type="date"
                          name="billingPeriodStart"
                          required
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Period end</label>
                        <input
                          type="date"
                          name="billingPeriodEnd"
                          required
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Due date</label>
                        <input
                          type="date"
                          name="dueDate"
                          required
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelClass}>Rent amount</label>
                        <input
                          type="number"
                          name="rentAmount"
                          min={0}
                          step="0.01"
                          required
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Other charges</label>
                        <input
                          type="number"
                          name="otherCharges"
                          min={0}
                          step="0.01"
                          placeholder="0"
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-surface hover:opacity-90"
                    >
                      Add bill
                    </button>
                  </form>
                </details>
              </div>

              {/* ================================================
                  WATER & ELECTRICITY
              ================================================ */}
              <div>
                <p className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Water &amp; electricity
                </p>

                <p className="mb-3 text-xs text-foreground-muted">
                  Billed to the room as a whole — never split per tenant
                  automatically. Paid directly to you.
                </p>

                {utilityBills.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No water/electricity bills yet for this room.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {utilityBills.map((bill) => {
                      const status = displayBillStatus(bill);
                      const remaining =
                        Number(bill.total_amount) - Number(bill.amount_paid);

                      return (
                        <div
                          key={bill.id}
                          className="rounded-md bg-surface-muted p-3 text-xs"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <span>Due {formatBillDate(bill.due_date)}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium capitalize ${billStatusStyles[status]}`}
                            >
                              {status}
                            </span>
                          </div>

                          <div className="mb-1.5 flex items-center justify-between text-foreground-muted">
                            <span>
                              Water {formatMoney(bill.water_amount)} +
                              Electricity {formatMoney(bill.electricity_amount)}
                            </span>
                            <span className="font-mono text-accent">
                              {formatMoney(bill.total_amount)}
                            </span>
                          </div>

                          {bill.notes && (
                            <p className="mb-1.5 text-foreground-muted">
                              {bill.notes}
                            </p>
                          )}

                          <div className="flex items-center justify-between rounded-md bg-background px-2 py-1.5">
                            <span>Paid {formatMoney(bill.amount_paid)}</span>
                            <span
                              className={
                                remaining > 0
                                  ? "text-status-overdue"
                                  : "text-status-paid"
                              }
                            >
                              {remaining > 0
                                ? `${formatMoney(remaining)} remaining`
                                : "Fully paid"}
                            </span>
                          </div>

                          {status !== "paid" && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <form action={recordUtilityPayment}>
                                <input
                                  type="hidden"
                                  name="utilityBillId"
                                  value={bill.id}
                                />
                                <input
                                  type="hidden"
                                  name="amount"
                                  value={remaining.toFixed(2)}
                                />
                                <RedirectFields
                                  roomId={roomId}
                                  redirectState={redirectState}
                                />
                                <button
                                  type="submit"
                                  className="rounded-md bg-status-paid px-2.5 py-1 font-medium text-surface hover:opacity-90"
                                >
                                  Mark as Paid — {formatMoney(remaining)}
                                </button>
                              </form>

                              <form
                                action={recordUtilityPayment}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  type="hidden"
                                  name="utilityBillId"
                                  value={bill.id}
                                />
                                <RedirectFields
                                  roomId={roomId}
                                  redirectState={redirectState}
                                />
                                <input
                                  type="number"
                                  name="amount"
                                  min={0}
                                  step="0.01"
                                  required
                                  placeholder="Amount"
                                  className="w-24 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary"
                                />
                                <button
                                  type="submit"
                                  className="rounded-md border border-border px-2.5 py-1 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                                >
                                  Record
                                </button>
                              </form>
                            </div>
                          )}

                          {Number(bill.amount_paid) === 0 && (
                            <form action={deleteUtilityBill} className="mt-2">
                              <input
                                type="hidden"
                                name="utilityBillId"
                                value={bill.id}
                              />
                              <RedirectFields
                                roomId={roomId}
                                redirectState={redirectState}
                              />
                              <button
                                type="submit"
                                className="rounded-md border border-status-overdue/30 px-2.5 py-1 text-status-overdue hover:bg-status-overdue/10"
                              >
                                Delete
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <details className="mt-3 rounded-md border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    Add a water/electricity bill
                  </summary>

                  <form action={createUtilityBill} className="mt-3 space-y-3">
                    <input type="hidden" name="roomId" value={roomId} />
                    <RedirectFields
                      roomId={roomId}
                      redirectState={redirectState}
                    />

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>Period start</label>
                        <input
                          type="date"
                          name="billingPeriodStart"
                          required
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Period end</label>
                        <input
                          type="date"
                          name="billingPeriodEnd"
                          required
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Due date</label>
                        <input
                          type="date"
                          name="dueDate"
                          required
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelClass}>Water bill</label>
                        <input
                          type="number"
                          name="waterAmount"
                          min={0}
                          step="0.01"
                          placeholder="0"
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Electricity bill</label>
                        <input
                          type="number"
                          name="electricityAmount"
                          min={0}
                          step="0.01"
                          placeholder="0"
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Notes (optional)</label>
                      <input
                        type="text"
                        name="notes"
                        placeholder="e.g. Meralco + water co-op reading for October"
                        className={inputClass}
                      />
                    </div>

                    <button
                      type="submit"
                      className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-surface hover:opacity-90"
                    >
                      Add utility bill
                    </button>
                  </form>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
