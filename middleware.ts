// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/adminEmails";
import { customDomainsEnabled, isOwnHost, normaliseHost } from "@/lib/customDomains";
import { routeTenantPath, TENANT_SLUG_PREFIX } from "@/lib/publicSlug";
import { askedHelpLocale } from "@/lib/support/locale";

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
const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar", "pt", "pt-BR"];

// Forwarded to route handlers when the request arrived through a
// creator's custom domain. Route handlers + the catch-all page read
// it (via `headers()` in server components, or `req.headers` in route
// handlers) to validate that the resolved content actually belongs
// to that domain's owner. Same convention as Tiquiz, different
// header name so the two apps never collide on the same VPS.
const CUSTOM_HOST_HEADER = "x-tipote-custom-host";

/**
 * Detect preferred locale from Accept-Language header.
 * Two-pass: exact BCP 47 match ("pt-BR" → "pt-BR") then language prefix
 * ("pt-BR" → "pt"). This is what gives a Brazilian browser pt-BR instead
 * of being forced to pt. Falls back to 'fr'.
 */
function detectLocaleFromHeader(req: NextRequest): string {
  const acceptLang = req.headers.get("accept-language") ?? "";
  const tags = acceptLang.split(",").map((l) => l.split(";")[0].trim()).filter(Boolean);
  for (const tag of tags) {
    const match = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === tag.toLowerCase());
    if (match) return match;
  }
  for (const tag of tags) {
    const prefix = tag.split("-")[0].toLowerCase();
    const match = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === prefix);
    if (match) return match;
  }
  return "fr";
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
  // Les generateurs de contenu : ils lisent les quiz de la personne et
  // consomment de l'IA. Absente d'ici, la page rendrait sa coquille a
  // quelqu'un de deconnecte avant que la page serveur ne le renvoie.
  "/generateurs",
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

  // NB: le routing affiliate.tipote.com → /affiliate/* est fait dans
  // next.config.ts via `async rewrites()` (pattern Next.js officiel
  // pour le subdomain-to-path mapping). On évite NextResponse.rewrite
  // ici qui en Next 16 essaie un fetch externe et crashe en EPROTO
  // (https://localhost:3000 wrong version number).

  // ─────────────────────────────────────────────────────────────────
  // Custom-domain gate. Runs FIRST so a creator-owned hostname can
  // never accidentally land on /dashboard, /login, /admin, etc.
  // Dormant when CUSTOM_DOMAINS_ENABLED is unset (default), so
  // existing users see absolutely zero behaviour change until Phase 6
  // flips the env var.
  //
  // We do NOT touch the database here — Edge runtime, latency
  // sensitive. We just detect "Host is not one of ours" and forward
  // the hostname to route handlers (and the catch-all page) via a
  // request header. They use supabaseAdmin and can validate
  // ownership without a second hop.
  // ─────────────────────────────────────────────────────────────────
  if (customDomainsEnabled()) {
    const rawHost = req.headers.get("host");
    if (!isOwnHost(rawHost)) {
      const host = normaliseHost(rawHost)!;
      const route = routeTenantPath(pathname);
      if (route.kind === "block") {
        // Don't expose dashboard / admin / login to the creator's
        // branded URL. Explicit 404 so visitors don't accidentally
        // discover those screens via someone else's domain.
        return new NextResponse("Not found", { status: 404 });
      }
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set(CUSTOM_HOST_HEADER, host);
      // Le slug nu est RÉÉCRIT vers un chemin qui n'est pas une page de
      // l'app. Sans ça, le routeur Next ferait gagner sa route statique
      // contre le catch-all, et un contenu nommé "quiz", "pages" ou
      // "contents" serait inatteignable sur le domaine de sa créatrice.
      // C'est ce qui obligeait à lui interdire ces mots (retour Béné,
      // 4 août 2026). L'URL vue par le visiteur ne change pas.
      if (route.kind === "slug") {
        const url = req.nextUrl.clone();
        url.pathname = `${TENANT_SLUG_PREFIX}/${route.slug}`;
        return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  // ✅ Route publique exacte "/" (page login)
  if (pathname === "/") return NextResponse.next();

  // Locale detection: set ui_locale cookie on first visit from Accept-Language header.
  // Protected-route middleware already has the correct response object below,
  // so we propagate locale through a header and set the cookie on `res` later.
  const hasLocaleCookie = !!req.cookies.get(UI_LOCALE_COOKIE)?.value;
  const detectedLocale = hasLocaleCookie
    ? req.cookies.get(UI_LOCALE_COOKIE)!.value
    : detectLocaleFromHeader(req);

  // 1bis) Le centre d'aide est PUBLIC, et c'est aussi l'aide de Tiquiz.
  //
  //   Le cookie `ui_locale` n'est posé que sur les routes protégées (plus
  //   bas). Une cliente Tiquiz n'a pas de compte Tipote, donc pas de
  //   cookie sur ce domaine : elle cliquait sur "Aide" et lisait les 57
  //   articles en français, quelle que soit sa langue.
  //
  //   La page lit déjà `?lang=` pour SON rendu (lib/support/locale.ts) ;
  //   ici on le mémorise, sinon le premier clic vers un article, qui n'a
  //   pas le paramètre, la ramènerait au français.
  if (pathname.startsWith("/support")) {
    const asked = askedHelpLocale(req.nextUrl.searchParams.get("lang"));
    const aRetenir = asked ?? (hasLocaleCookie ? null : detectedLocale);
    if (!aRetenir) return NextResponse.next();
    const res = NextResponse.next();
    res.cookies.set(UI_LOCALE_COOKIE, aRetenir, {
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return res;
  }

  // 1) Toujours laisser passer les routes publiques
  if (startsWithAny(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next();
  }

  // 2a) Security headers for public-facing pages (/p/, /q/).
  //
  //     ⚠️ NE JAMAIS poser `X-Frame-Options` ici. Ces routes sont
  //     embeddable par les users sur leur blog/landing (Systeme.io,
  //     WordPress, Wix). Régression du 9 mai 2026 (commit 056ddfb1)
  //     qui a cassé l'embed de JB chez imagelys.com — fix dans
  //     8b41d898 (21 mai 2026). Voir CLAUDE_PITFALLS.md section X.
  //
  //     `frame-ancestors *` autorise l'embedding cross-origin tout
  //     en gardant les autres hardening headers (anti-MIME-sniff,
  //     anti-FLoC, etc.).
  if (pathname.startsWith("/p/") || pathname.startsWith("/q/")) {
    const res = NextResponse.next();
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "interest-cohort=()");
    res.headers.set("X-DNS-Prefetch-Control", "off");
    res.headers.set("Content-Security-Policy", "frame-ancestors *");
    res.headers.delete("X-Frame-Options");
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

    // ── Onboarding check: SINGLE query for ALL profiles, then decide ──
    // ANTI-LOOP: never redirect to /onboarding if at least ONE profile is completed.
    // The old primary+fallback approach had a bug: the primary path would redirect
    // immediately when the cookie pointed to an un-onboarded project, without
    // checking if another project was completed. This caused infinite loops.
    {
      type BpRow = { onboarding_completed?: boolean; ui_locale?: string; project_id?: string };

      let bpRows: BpRow[] | null = null;
      let bpError: unknown = null;

      try {
        const { data, error } = await supabase
          .from("business_profiles")
          .select("onboarding_completed, ui_locale, project_id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(10);
        bpRows = data as BpRow[] | null;
        bpError = error;
      } catch {
        return res; // fail-open: DB error → don't block
      }

      if (bpError) return res; // fail-open

      // Find the best profile: prefer the one matching the cookie, then any completed one
      const activeMatch = activeProjectId
        ? (bpRows ?? []).find((r) => r.project_id === activeProjectId)
        : null;

      const completedProfile = (bpRows ?? []).find((r) => r.onboarding_completed);

      // Cross-device locale sync
      const localeSource = activeMatch ?? completedProfile ?? (bpRows ?? [])[0];
      if (localeSource?.ui_locale && SUPPORTED_LOCALES.includes(localeSource.ui_locale)) {
        res.cookies.set(UI_LOCALE_COOKIE, localeSource.ui_locale, {
          path: "/",
          maxAge: 365 * 24 * 60 * 60,
          sameSite: "lax",
        });
      }

      // Happy path: the cookie points to a completed profile
      if (activeMatch?.onboarding_completed) {
        return res;
      }

      // Cookie points to un-onboarded project (or no cookie), but another project IS completed.
      // IMPORTANT: do NOT overwrite the cookie here. The user may have intentionally
      // switched to this project via the project selector. Overwriting would lock them
      // out of switching projects. Just allow through — the app handles per-project state.
      // Only set cookie if there is NO cookie at all (e.g. first visit after login).
      //
      // CRITICAL — DO NOT reintroduce a "force-redirect to onboarding when activeMatch
      // is un-onboarded" branch here. We had it once, it broke every legacy user whose
      // first project happened to have onboarding_completed = false or NULL: they all
      // got dumped onto /onboarding even though they had years of content. The new-
      // project flow handles the redirect explicitly from the ProjectSwitcher instead.
      if (completedProfile) {
        if (!activeProjectId && completedProfile.project_id) {
          res.cookies.set(ACTIVE_PROJECT_COOKIE, completedProfile.project_id, {
            path: "/",
            maxAge: 365 * 24 * 60 * 60,
            sameSite: "lax",
          });
        }
        return res;
      }

      // No completed profile at all → redirect to onboarding
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  } catch {
    return res; // fail-open total
  }
}

export const config = {
  matcher: [
    // Broad pattern so the custom-domain gate at the top of
    // middleware() can intercept ANY request whose Host belongs to a
    // creator's branded domain. Excludes:
    //   - /api/*    routes handle their own auth, never need locale/onboarding/host-gate
    //   - /_next/*  framework assets
    //   - any path with a file extension (.png, .ico, .map, .xml…) —
    //     static files served straight by Next, no header forwarding needed
    //   - the /widgets/*.js path explicitly (embeddable widget bundles
    //     served cross-origin from external sites)
    "/((?!api|_next|widgets/.*\\.js|.*\\..*).*)",
  ],
};