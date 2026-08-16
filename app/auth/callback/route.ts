import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for Supabase email confirmation links
// (`emailRedirectTo` in lib/actions.ts points here). Exchanges the
// one-time code for a session, then hands off to `/`, which already
// knows how to route a signed-in user to /admin or /tenant by role.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/?error=` +
      encodeURIComponent(
        "That confirmation link is invalid or has expired. Try signing in, or sign up again for a new one."
      )
  );
}
