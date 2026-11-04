import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import { getPlatformSettings } from "@/lib/platform-settings";

// Platform-wide COUNTS only. Deliberately nothing about any dorm's money,
// tenants, bills or payments -- those belong to the owner.
export default async function PlatformOverviewPage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const head = (table: string) =>
    admin.from(table).select("id", { count: "exact", head: true });

  const [dorms, owners, tenants, pending, suspended, disabled, recent, settings] =
    await Promise.all([
      head("dormitories"),
      head("users").eq("role", "owner"),
      head("users").eq("role", "tenant"),
      head("dormitories").is("approved_at", null).is("suspended_at", null),
      head("dormitories").not("suspended_at", "is", null),
      head("users").not("disabled_at", "is", null),
      admin
        .from("audit_log")
        .select("id, created_at, action, actor_email, target_label")
        .order("created_at", { ascending: false })
        .limit(5),
      getPlatformSettings(admin),
    ]);

  if (dorms.error || owners.error || tenants.error) {
    console.error("Could not load platform overview:", dorms.error ?? owners.error ?? tenants.error);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="the overview" />
      </div>
    );
  }

  // The lifecycle counts need migration 0028; show a dash until it exists.
  const stat = (r: { count: number | null; error: unknown }) => (r.error ? "—" : String(r.count ?? 0));

  const cards = [
    { label: "Dormitories", value: stat(dorms), href: "/platform/dorms" },
    { label: "Owners", value: stat(owners), href: "/platform/accounts?role=owner" },
    { label: "Tenants", value: stat(tenants), href: "/platform/accounts?role=tenant" },
    { label: "Awaiting approval", value: stat(pending), href: "/platform/dorms?status=pending", alert: (pending.count ?? 0) > 0 },
    { label: "Suspended dorms", value: stat(suspended), href: "/platform/dorms?status=suspended" },
    { label: "Disabled accounts", value: stat(disabled), href: "/platform/accounts?status=disabled" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Platform admin</p>
        <h1 className="font-heading text-lg font-semibold text-primary">Overview</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-muted"
          >
            <p className="text-xs text-foreground-muted">{card.label}</p>
            <p
              className={`font-mono text-xl font-semibold ${
                card.alert ? "text-status-overdue" : "text-foreground"
              }`}
            >
              {card.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <p className="text-xs text-foreground-muted">New dormitories</p>
        <p className="text-foreground">
          {settings.requireOwnerApproval
            ? "Wait for your approval before the owner can sign in."
            : "Are approved automatically."}{" "}
          <Link href="/platform/settings" className="text-primary underline underline-offset-2">
            Change
          </Link>
        </p>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        <Link href="/platform/audit" className="text-xs text-primary underline underline-offset-2">
          Full audit log
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {(recent.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">Nothing recorded yet.</p>
        ) : (
          (recent.data ?? []).map((row, i, rows) => (
            <div
              key={row.id}
              className={`px-4 py-2.5 ${i < rows.length - 1 ? "border-b border-border" : ""}`}
            >
              <p className="text-sm text-foreground">
                <span className="font-mono text-xs">{row.action}</span>
                {row.target_label ? ` · ${row.target_label}` : ""}
              </p>
              <p className="text-xs text-foreground-muted">
                {new Date(row.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
