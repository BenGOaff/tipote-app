// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Invariants (anti-régression)
 * 1) /api, /auth, /onboarding, assets => jamais bloqués par le middleware
 * 2) Routes protégées => user connecté + onboarding complété
 * 3) Fail-open DB: si Supabase/table/colonne casse => on laisse passer (ne jamais casser la prod)
 *
 * IMPORTANT:
 * - Dans ce repo, la page de connexion est "/" (pas "/login")
 * - On garde "/login" en public au cas où (legacy / liens externes), mais on ne redirige pas dessus.
 */

const PUBLIC_PREFIXES = [
  "/", // ✅ page login du repo
  "/login", // legacy
  "/onboarding",
  "/auth",
  "/api",
  "/_next",
  "/favicon.ico",
  "/icon.png",
  "/tipote-logo.png",
];

const ADMIN_EMAIL = "hello@ethilife.fr";

const PROTECTED_PREFIXES = [
  "/app",
  "/dashboard",
  "/strategy",
  "/tasks",
  "/contents",
  "/create",
  "/templates",
  "/pepites",
  "/settings",
  "/analytics",
  "/admin",
];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Route publique exacte "/" (page login)
  if (pathname === "/") return NextResponse.next();

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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/"; // ✅ login réel
      return NextResponse.redirect(url);
    }

    // ✅ Admin: accessible uniquement à l'email admin (et ne dépend pas de l'onboarding)
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const email = (user.email ?? "").toLowerCase();
      if (email !== ADMIN_EMAIL.toLowerCase()) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return res;
    }

    // Vérif onboarding (fail-open)
    const { data: bp, error } = await supabase
      .from("business_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return res; // fail-open DB

    if (!bp?.onboarding_completed) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    return res;
  } catch {
    return res; // fail-open total
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
    "/pepites/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/admin/:path*",
  ],
};
