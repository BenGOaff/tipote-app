// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Invariants (anti-régression)
 * 1) /api, /auth, /login, /onboarding, assets => jamais bloqués par le middleware
 * 2) Routes “app” (dashboard/strategy/tasks/etc) => nécessitent user connecté + onboarding complété
 * 3) Fail-open DB: si Supabase/table/colonne casse => on laisse passer (ne jamais casser la prod)
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/onboarding",
  "/auth",
  "/api",
  "/_next",
  "/favicon.ico",
  "/icon.png",
];

const PROTECTED_PREFIXES = [
  "/app",
  "/dashboard",
  "/strategy",
  "/tasks",
  "/contents",
  "/create",
  "/templates",
  "/settings",
  "/analytics",
];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Toujours laisser passer les routes publiques
  if (startsWithAny(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next();
  }

  // 2) Ne traiter que les routes protégées (le reste passe)
  if (!startsWithAny(pathname, PROTECTED_PREFIXES)) {
    return NextResponse.next();
  }

  // 3) Réponse mutable pour cookies Supabase SSR
  const res = NextResponse.next();

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
    // 4) Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // 5) Vérif onboarding (fail-open)
    const { data: bp, error } = await supabase
      .from("business_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fail-open DB : si erreur schema/RLS => on laisse passer
    if (error) return res;

    if (!bp?.onboarding_completed) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    return res;
  } catch {
    // Fail-open total
    return res;
  }
}

export const config = {
  matcher: [
    "/app/:path*",
    "/dashboard/:path*",
    "/strategy/:path*",
    "/tasks/:path*",
    "/contents/:path*",
    "/create/:path*",
    "/templates/:path*",
    "/settings/:path*",
    "/analytics/:path*",
  ],
};
