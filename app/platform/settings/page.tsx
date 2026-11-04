import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import { getPlatformSettings } from "@/lib/platform-settings";
import { SubmitButton } from "@/components/submit-button";
import { setApprovalRequirement } from "@/lib/platform-actions";

export default async function PlatformSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requirePlatformAdmin();
  const { error, saved } = await searchParams;
  const settings = await getPlatformSettings(createAdminClient());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Platform admin</p>
        <h1 className="font-heading text-lg font-semibold text-primary">Settings</h1>
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

      <form action={setApprovalRequirement} className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Approve new dormitories</h2>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
          Off: anyone can sign up as an owner and start using DormVision straight away. On: a new
          owner&apos;s dormitory waits until you approve it. They can&apos;t sign in, and tenants can&apos;t
          join it, in the meantime. Dormitories that already exist are not affected.
        </p>

        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="require"
            defaultChecked={settings.requireOwnerApproval}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Require my approval for new dormitories
        </label>

        <SubmitButton
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
          pendingText="Saving…"
        >
          Save
        </SubmitButton>
      </form>
    </div>
  );
}
