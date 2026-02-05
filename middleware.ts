// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = [
  "/login",
  "/onboarding",
  "/auth",
  "/api",
  "/_next",
  "/favicon.ico",
  "/icon.png",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1️⃣ Toujours laisser passer les routes publiques
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2️⃣ On ne protège que /app
  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  // 3️⃣ Supabase SSR client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name, options) => {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  try {
    // 4️⃣ Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // 5️⃣ Vérif onboarding (fail-open)
    const { data: profile, error } = await supabase
      .from("business_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    // Si erreur DB → on laisse passer (ne jamais casser l'app)
    if (error) {
      return res;
    }

    if (!profile?.onboarding_completed) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // ✅ onboarding OK
    return res;
  } catch {
    // fail-open total
    return res;
  }
}

export const config = {
  matcher: ["/app/:path*"],
};
