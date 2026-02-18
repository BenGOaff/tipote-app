// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/adminEmails";

/**
 * Invariants (anti-régression)
 * 1) /api, /auth, /onboarding, assets => jamais bloqués par le middleware
 * 2) Routes protégées => user connecté + onboarding complété (pour le projet actif)
 * 3) Fail-open DB: si Supabase/table/colonne casse => on laisse passer (ne jamais casser la prod)
 *
 * IMPORTANT:
 * - Dans ce repo, la page de connexion est "/" (pas "/login")
 * - On garde "/login" en public au cas où (legacy / liens externes), mais on ne redirige pas dessus.
 *
 * MULTI-PROJETS:
 * - Le cookie `tipote_active_project` indique le projet actif
 * - Si ce projet n'a pas complété l'onboarding => redirect /onboarding
 * - Fallback : vérifier le business_profiles par user_id (ancien comportement)
 */

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";
const UI_LOCALE_COOKIE = "ui_locale";
const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar"];

/** Detect preferred locale from Accept-Language header (falls back to 'fr'). */
function detectLocaleFromHeader(req: NextRequest): string {
  const acceptLang = req.headers.get("accept-language") ?? "";
  const langs = acceptLang.split(",").map((l) => l.split(";")[0].trim().slice(0, 2).toLowerCase());
  return langs.find((l) => SUPPORTED_LOCALES.includes(l)) ?? "fr";
}

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

  // Locale detection: set ui_locale cookie on first visit from Accept-Language header.
  // Protected-route middleware already has the correct response object below,
  // so we propagate locale through a header and set the cookie on `res` later.
  const hasLocaleCookie = !!req.cookies.get(UI_LOCALE_COOKIE)?.value;
  const detectedLocale = hasLocaleCookie
    ? req.cookies.get(UI_LOCALE_COOKIE)!.value
    : detectLocaleFromHeader(req);

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

  // Persist detected locale (first-visit or existing) on all protected responses.
  if (!hasLocaleCookie) {
    res.cookies.set(UI_LOCALE_COOKIE, detectedLocale, {
      path: "/",
      maxAge: 365 * 24 * 60 * 60, // 1 year
      sameSite: "lax",
    });
  }

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

    // ✅ Admin: accessible uniquement aux emails admin (et ne dépend pas de l'onboarding)
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      if (!isAdminEmail(user.email)) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return res;
    }

    // Vérif onboarding pour le projet actif (fail-open)
    const activeProjectId = req.cookies.get(ACTIVE_PROJECT_COOKIE)?.value?.trim() ?? "";

    // Si un project_id est défini, vérifier l'onboarding de CE projet
    if (activeProjectId) {
      try {
        const { data: bp, error } = await supabase
          .from("business_profiles")
          .select("onboarding_completed")
          .eq("user_id", user.id)
          .eq("project_id", activeProjectId)
          .maybeSingle();

        if (!error && bp) {
          if (!bp.onboarding_completed) {
            const url = req.nextUrl.clone();
            url.pathname = "/onboarding";
            return NextResponse.redirect(url);
          }
          return res;
        }
        // Si pas de résultat avec project_id (migration pas encore faite), fallback ci-dessous
      } catch {
        // fail-open
      }
    }

    // Fallback : vérifier par user_id seul (ancien comportement / compat)
    const { data: bp, error } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, ui_locale")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return res; // fail-open DB

    // Cross-device locale sync: if DB has a saved ui_locale, apply it to cookie.
    const dbLocale = (bp as any)?.ui_locale;
    if (dbLocale && SUPPORTED_LOCALES.includes(dbLocale)) {
      res.cookies.set(UI_LOCALE_COOKIE, dbLocale, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
        sameSite: "lax",
      });
    }

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