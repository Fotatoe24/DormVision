import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { LoadError } from "@/components/load-error";
import { EmptyState } from "@/components/empty-state";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PaginationControls } from "@/components/pagination-controls";
import { SubmitButton } from "@/components/submit-button";
import { ReasonActionButton } from "@/components/reason-action-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import {
  clearLockout,
  disableAccount,
  enableAccount,
  sendResetLink,
  signOutEverywhere,
} from "@/lib/platform-actions";
import {
  parsePage,
  getRange,
  getTotalPages,
  isPageOutOfRange,
  pageHref,
} from "@/lib/pagination";

const secondaryButton =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted";
const dangerButton =
  "rounded-md bg-status-overdue px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90";

const roleLabels: Record<string, string> = { owner: "Owner", tenant: "Tenant" };

export default async function PlatformAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    page?: string;
    error?: string;
    saved?: string;
  }>;
}) {
  await requirePlatformAdmin();
  const { q, role, status, page: pageParam, error, saved } = await searchParams;
  const page = parsePage(pageParam);
  const admin = createAdminClient();

  // The platform admin's own account is never listed or editable here.
  let query = admin
    .from("users")
    .select("id, full_name, email, role, dorm_id, disabled_at, disabled_reason, created_at", {
      count: "exact",
    })
    .in("role", ["owner", "tenant"])
    .order("created_at", { ascending: false })
    .order("id");

  if (q) {
    const term = q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (role === "owner" || role === "tenant") query = query.eq("role", role);
  if (status === "disabled") query = query.not("disabled_at", "is", null);

  const { from, to } = getRange(page);
  const { data, count, error: loadError } = await query.range(from, to);

  if (isPageOutOfRange(loadError)) {
    redirect(pageHref("/platform/accounts", { q, role, status }, "page", 1));
  }

  if (loadError) {
    console.error("Could not load accounts:", loadError);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="accounts" />
      </div>
    );
  }

  const accounts = data ?? [];

  const dormIds = Array.from(new Set(accounts.map((a) => a.dorm_id).filter((id): id is string => Boolean(id))));
  const { data: dorms } = dormIds.length
    ? await admin.from("dormitories").select("id, name").in("id", dormIds)
    : { data: [] };
  const dormName = new Map((dorms ?? []).map((d) => [d.id, d.name]));

  const hasFilters = Boolean(q || role || status);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Platform admin</p>
        <h1 className="font-heading text-lg font-semibold text-primary">Accounts</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
          {saved}
        </div>
      )}

      <AutoSubmitForm className="mb-4 flex flex-wrap gap-2" action="/platform/accounts">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or email..."
          className="min-w-[160px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <select
          name="role"
          defaultValue={role ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">Owners and tenants</option>
          <option value="owner">Owners</option>
          <option value="tenant">Tenants</option>
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">Any status</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </AutoSubmitForm>

      <div className="mb-3 text-xs text-foreground-muted">
        Showing {count ?? 0} account{count === 1 ? "" : "s"}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {accounts.length > 0 ? (
          accounts.map((account, i) => {
            const hidden = (
              <>
                <input type="hidden" name="userId" value={account.id} />
                <input type="hidden" name="q" value={q ?? ""} />
              </>
            );

            return (
              <details
                key={account.id}
                className={`group ${i < accounts.length - 1 ? "border-b border-border" : ""}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.full_name}</p>
                    <p className="truncate text-xs text-foreground-muted">
                      {account.email} · {roleLabels[account.role] ?? account.role}
                      {account.dorm_id && dormName.get(account.dorm_id)
                        ? ` · ${dormName.get(account.dorm_id)}`
                        : ""}
                    </p>
                  </div>
                  {account.disabled_at && (
                    <span className="shrink-0 rounded-full bg-status-overdue/15 px-2.5 py-0.5 text-xs font-medium text-status-overdue">
                      Disabled
                    </span>
                  )}
                </summary>

                <div className="border-t border-border bg-surface-muted px-4 py-3">
                  {account.disabled_at && (
                    <p className="mb-3 text-xs text-foreground-muted">
                      Disabled: {account.disabled_reason ?? "no reason recorded"}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <form action={sendResetLink}>
                      {hidden}
                      <SubmitButton className={secondaryButton} pendingText="Sending…">
                        Email a reset link
                      </SubmitButton>
                    </form>
                    <form action={clearLockout}>
                      {hidden}
                      <SubmitButton className={secondaryButton}>Clear sign-in lockout</SubmitButton>
                    </form>
                    <form action={signOutEverywhere}>
                      {hidden}
                      <SubmitButton className={secondaryButton}>Sign out everywhere</SubmitButton>
                    </form>

                    {account.disabled_at ? (
                      <form action={enableAccount}>
                        {hidden}
                        <SubmitButton className={secondaryButton}>Enable account</SubmitButton>
                      </form>
                    ) : (
                      <form action={disableAccount}>
                        {hidden}
                        <ReasonActionButton
                          className={dangerButton}
                          title={`Disable ${account.email}?`}
                          description="They're signed out and can't sign in until you enable the account. Nothing is deleted."
                          confirmLabel="Disable account"
                        >
                          Disable…
                        </ReasonActionButton>
                      </form>
                    )}
                  </div>
                </div>
              </details>
            );
          })
        ) : (
          <EmptyState
            icon={Users}
            title={hasFilters ? "No accounts found" : "No accounts yet"}
            description={hasFilters ? "Try a different search or filter." : "Accounts appear here as people sign up."}
          />
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={getTotalPages(count ?? 0)}
        hrefForPage={(p) => pageHref("/platform/accounts", { q, role, status }, "page", p)}
      />
    </div>
  );
}
