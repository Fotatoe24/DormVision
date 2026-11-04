import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginCard } from "@/components/login-card";

export default async function Home() {
  const session = await getSessionUser();

  // Already signed in — skip straight to the right dashboard.
  if (session) {
    const role = session.profile?.role;
    redirect(role === "owner" ? "/admin" : role === "platform_admin" ? "/platform" : "/tenant");
  }

  return <LoginCard />;
}
