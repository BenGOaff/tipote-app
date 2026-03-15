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
  "/legal", // pages légales (CGU, CGV, privacy, mentions)
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
  "/automations",
  "/widgets",
  "/clients",
  "/webinars",
  "/leads",
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

  // 2a) Security headers for public-facing pages (/p/, /q/)
  //     Prevents domain flagging by antivirus/social networks.
  if (pathname.startsWith("/p/") || pathname.startsWith("/q/")) {
    const res = NextResponse.next();
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "interest-cohort=()");
    res.headers.set("X-DNS-Prefetch-Control", "off");
    return res;
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
          .select("onboarding_completed, ui_locale")
          .eq("user_id", user.id)
          .eq("project_id", activeProjectId)
          .maybeSingle();

        // Cross-device locale sync
        const dbLocale = (bp as any)?.ui_locale;
        if (dbLocale && SUPPORTED_LOCALES.includes(dbLocale)) {
          res.cookies.set(UI_LOCALE_COOKIE, dbLocale, {
            path: "/",
            maxAge: 365 * 24 * 60 * 60,
            sameSite: "lax",
          });
        }

        if (!error && bp) {
          if (!bp.onboarding_completed) {
            const url = req.nextUrl.clone();
            url.pathname = "/onboarding";
            return NextResponse.redirect(url);
          }
          return res;
        }
        // Pas de row business_profiles pour ce projet → onboarding nécessaire
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      } catch {
        return res; // fail-open
      }
    }

    // Fallback : vérifier par user_id seul (beta users sans cookie projet)
    // ✅ Query business_profiles WITH project_id to also auto-set the cookie
    const { data: bpRows, error: bpError } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, ui_locale, project_id")
      .eq("user_id", user.id)
      .order("onboarding_completed", { ascending: false }) // completed ones first
      .limit(5);

    if (bpError) return res; // fail-open DB

    // Find the best profile: prefer completed ones, with project_id
    const completedBp = (bpRows ?? []).find((r: any) => r.onboarding_completed === true);
    const anyBp = completedBp ?? (bpRows ?? [])[0] ?? null;

    // Cross-device locale sync
    const dbLocale = (anyBp as any)?.ui_locale;
    if (dbLocale && SUPPORTED_LOCALES.includes(dbLocale)) {
      res.cookies.set(UI_LOCALE_COOKIE, dbLocale, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
        sameSite: "lax",
      });
    }

    // ✅ Auto-set project cookie for beta users so this fallback doesn't run on every request
    if (anyBp && (anyBp as any).project_id) {
      res.cookies.set(ACTIVE_PROJECT_COOKIE, (anyBp as any).project_id, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
        sameSite: "lax",
      });
    }

    // If we found a completed profile, let the user through
    if (completedBp) {
      return res;
    }

    // No completed profile found
    if (!anyBp) {
      // No profile at all — need onboarding
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Profile exists but onboarding not completed
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
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
    "/automations/:path*",
    // Only match /widgets page itself (app UI), NOT /widgets/*.js static files
    // which must be served publicly for cross-origin embedding on external blogs.
    "/widgets",
    "/clients/:path*",
    "/webinars/:path*",
    "/leads/:path*",
  ],
};