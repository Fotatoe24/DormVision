"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, CreditCard, Users, Bell, Wrench, Save } from "lucide-react";

type Settings = {
  id: string;
  dorm_id: string;
  billing_due_day: number;
  grace_period_days: number;
  late_payment_fee: number;
  enable_payment_reminders: boolean;
  enable_overdue_notifications: boolean;
  allow_tenant_registration: boolean;
  allow_room_transfers: boolean;
  require_transfer_approval: boolean;
  enable_new_tenant_notifications: boolean;
  enable_maintenance_notifications: boolean;
  allow_maintenance_requests: boolean;
  require_maintenance_approval: boolean;
};

type Props = {
  dorm: {
    id: string;
    name: string;
  };
  settings: Settings | null;
};

export default function SettingsForm({ dorm, settings }: Props) {
  const [saving, setSaving] = useState(false);

  const [billingDueDay, setBillingDueDay] = useState(
    settings?.billing_due_day ?? 1
  );

  const [gracePeriodDays, setGracePeriodDays] = useState(
    settings?.grace_period_days ?? 0
  );

  const [latePaymentFee, setLatePaymentFee] = useState(
    settings?.late_payment_fee ?? 0
  );

  const [paymentReminders, setPaymentReminders] = useState(
    settings?.enable_payment_reminders ?? true
  );

  const [overdueNotifications, setOverdueNotifications] = useState(
    settings?.enable_overdue_notifications ?? true
  );

  const [tenantRegistration, setTenantRegistration] = useState(
    settings?.allow_tenant_registration ?? false
  );

  const [roomTransfers, setRoomTransfers] = useState(
    settings?.allow_room_transfers ?? true
  );

  const [transferApproval, setTransferApproval] = useState(
    settings?.require_transfer_approval ?? true
  );

  const [newTenantNotifications, setNewTenantNotifications] = useState(
    settings?.enable_new_tenant_notifications ?? true
  );

  const [maintenanceNotifications, setMaintenanceNotifications] = useState(
    settings?.enable_maintenance_notifications ?? true
  );

  const [maintenanceRequests, setMaintenanceRequests] = useState(
    settings?.allow_maintenance_requests ?? true
  );

  const [maintenanceApproval, setMaintenanceApproval] = useState(
    settings?.require_maintenance_approval ?? false
  );

  async function saveSettings() {
    setSaving(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dormId: dorm.id,

          billingDueDay,
          gracePeriodDays,
          latePaymentFee,

          paymentReminders,
          overdueNotifications,

          tenantRegistration,
          roomTransfers,
          transferApproval,

          newTenantNotifications,
          maintenanceNotifications,

          maintenanceRequests,
          maintenanceApproval,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Couldn't save settings");
        return;
      }

      toast.success("Settings saved");
    } catch {
      toast.error("Something went wrong while saving settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Billing */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <CreditCard className="h-4 w-4" />
          </div>

          <div>
            <h2 className="font-heading text-sm font-semibold">
              Billing & payments
            </h2>
            <p className="text-xs text-foreground-muted">
              Configure how tenant billing is handled.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-muted">
              Billing due day
            </label>

            <input
              type="number"
              min={1}
              max={31}
              value={billingDueDay}
              onChange={(e) => setBillingDueDay(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />

            <p className="mt-1 text-[11px] text-foreground-muted">
              Day of the month.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-muted">
              Grace period
            </label>

            <input
              type="number"
              min={0}
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />

            <p className="mt-1 text-[11px] text-foreground-muted">
              Number of days after the due date.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-muted">
              Late payment fee
            </label>

            <input
              type="number"
              min={0}
              step="0.01"
              value={latePaymentFee}
              onChange={(e) => setLatePaymentFee(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />

            <p className="mt-1 text-[11px] text-foreground-muted">
              Amount in Philippine pesos.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <Toggle
            label="Payment reminders"
            description="Notify tenants about upcoming payments."
            checked={paymentReminders}
            onChange={setPaymentReminders}
          />

          <Toggle
            label="Overdue notifications"
            description="Notify tenants when their balance becomes overdue."
            checked={overdueNotifications}
            onChange={setOverdueNotifications}
          />
        </div>
      </section>

      {/* Tenant management */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Users className="h-4 w-4" />
          </div>

          <div>
            <h2 className="font-heading text-sm font-semibold">
              Tenant management
            </h2>
            <p className="text-xs text-foreground-muted">
              Control tenant registration and room changes.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Toggle
            label="Allow tenant registration"
            description="Allow new tenants to register with this dormitory."
            checked={tenantRegistration}
            onChange={setTenantRegistration}
          />

          <Toggle
            label="Allow room transfers"
            description="Allow tenants to request a different room."
            checked={roomTransfers}
            onChange={setRoomTransfers}
          />

          <Toggle
            label="Require transfer approval"
            description="Room transfer requests must be approved by the owner."
            checked={transferApproval}
            onChange={setTransferApproval}
            disabled={!roomTransfers}
          />

          <Toggle
            label="New tenant notifications"
            description="Notify the owner when a new tenant joins."
            checked={newTenantNotifications}
            onChange={setNewTenantNotifications}
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Bell className="h-4 w-4" />
          </div>

          <div>
            <h2 className="font-heading text-sm font-semibold">
              Notifications
            </h2>
            <p className="text-xs text-foreground-muted">
              Control automatic dormitory notifications.
            </p>
          </div>
        </div>

        <Toggle
          label="Maintenance notifications"
          description="Notify the owner when a tenant submits a maintenance request."
          checked={maintenanceNotifications}
          onChange={setMaintenanceNotifications}
        />
      </section>

      {/* Maintenance */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Wrench className="h-4 w-4" />
          </div>

          <div>
            <h2 className="font-heading text-sm font-semibold">Maintenance</h2>
            <p className="text-xs text-foreground-muted">
              Control tenant maintenance requests.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Toggle
            label="Allow maintenance requests"
            description="Allow tenants to submit maintenance requests."
            checked={maintenanceRequests}
            onChange={setMaintenanceRequests}
          />

          <Toggle
            label="Require maintenance approval"
            description="Requests must be reviewed before becoming active."
            checked={maintenanceApproval}
            onChange={setMaintenanceApproval}
            disabled={!maintenanceRequests}
          />
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-md border border-border px-3 py-3 ${
        disabled ? "opacity-50" : "hover:bg-surface-muted/50"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>

        <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          checked ? "bg-primary" : "bg-surface-muted"
        } disabled:cursor-not-allowed`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
