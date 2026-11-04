import { requirePlatformAdmin } from "@/lib/platform-guard";
import { PlatformShell } from "@/components/platform-shell";
import { AppearanceSync } from "@/components/appearance-sync";
import { getSavedAppearance } from "@/lib/appearance";
import { getUserAvatar } from "@/lib/shell-data";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();

  const [appearance, avatar, pending] = await Promise.all([
    getSavedAppearance(admin.id),
    getUserAvatar(admin.id),
    // Dormitories waiting for approval (0 until migration 0028 exists).
    createAdminClient()
      .from("dormitories")
      .select("id", { count: "exact", head: true })
      .is("approved_at", null)
      .is("suspended_at", null),
  ]);

  return (
    <>
      <AppearanceSync userId={admin.id} {...appearance} />
      <PlatformShell
        adminName={admin.fullName}
        avatarUrl={avatar.avatarUrl}
        avatarColor={avatar.avatarColor}
        pendingDormCount={pending.error ? 0 : (pending.count ?? 0)}
      >
        {children}
      </PlatformShell>
    </>
  );
}
