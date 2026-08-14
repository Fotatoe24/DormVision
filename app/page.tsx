import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginCard } from "@/components/login-card";

export default async function Home() {
  const session = await getSessionUser();

  // Already signed in — skip straight to the right dashboard.
  if (session) {
    redirect(session.profile?.role === "owner" ? "/admin" : "/tenant");
  }

  return <LoginCard />;
}
