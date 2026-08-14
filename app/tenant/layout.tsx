import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TenantTopbar } from "@/components/tenant-topbar";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  const supabase = await createClient();

  const { data: dorm } = session.profile?.dorm_id
    ? await supabase
        .from("dormitories")
        .select("name")
        .eq("id", session.profile.dorm_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TenantTopbar dormName={dorm?.name} />
      <main className="flex-1 bg-background px-6 py-10 text-foreground">
        {children}
      </main>
    </div>
  );
}
