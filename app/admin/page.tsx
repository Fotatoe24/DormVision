import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions";

export default async function AdminPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  if (session.profile?.role !== "owner") {
    redirect("/tenant");
  }

  const supabase = await createClient();

  const { data: dorm } = await supabase
    .from("dormitories")
    .select("id, name, join_code")
    .eq("owner_id", session.user.id)
    .single();

  const { data: members } = await supabase
    .from("users")
    .select("id, full_name, email, role, created_at")
    .eq("dorm_id", dorm?.id)
    .order("created_at", { ascending: false });

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-heading text-lg font-semibold text-primary">
            DormVision
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-surface p-6">
          <p className="font-heading text-sm font-semibold mb-1">
            {dorm?.name ?? "Your dormitory"}
          </p>
          <p className="mb-3 text-sm text-foreground-muted">
            Share this Dorm ID so tenants can sign themselves up.
          </p>
          <div className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2">
            <span className="font-mono text-sm tracking-wider text-accent">
              {dorm?.join_code ?? "—"}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
            People in your dormitory
          </div>
          {members && members.length > 0 ? (
            <div>
              {members.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < members.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{m.full_name}</p>
                    <p className="text-xs text-foreground-muted">{m.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      m.role === "owner"
                        ? "bg-accent/15 text-accent"
                        : "bg-status-paid/15 text-status-paid"
                    }`}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-foreground-muted">
              No one has joined yet — share your Dorm ID above.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
