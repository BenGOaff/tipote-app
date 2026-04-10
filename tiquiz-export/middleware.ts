// middleware.ts
// Auth protection + locale detection for Tiquiz.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const UI_LOCALE_COOKIE = "ui_locale";
const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar"];

function detectLocaleFromHeader(req: NextRequest): string {
  const acceptLang = req.headers.get("accept-language") ?? "";
  const langs = acceptLang
    .split(",")
    .map((l) => l.split(";")[0].trim().slice(0, 2).toLowerCase());
  return langs.find((l) => SUPPORTED_LOCALES.includes(l)) ?? "fr";
}

const PROTECTED_PREFIXES = ["/dashboard", "/quiz", "/settings"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — never block
  if (pathname === "/") return NextResponse.next();

  // Public quiz pages /q/... and API routes
  if (
    pathname.startsWith("/q/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/legal/") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/favicon.ico"
  ) {
    const res = NextResponse.next();
    // Set locale cookie on first visit
    if (!req.cookies.get(UI_LOCALE_COOKIE)?.value) {
      res.cookies.set(UI_LOCALE_COOKIE, detectLocaleFromHeader(req), {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
        sameSite: "lax",
      });
    }
    return res;
  }

  // Protected routes — require auth
  if (startsWithAny(pathname, PROTECTED_PREFIXES)) {
    const res = NextResponse.next();

    // Set locale cookie if missing
    const hasLocaleCookie = !!req.cookies.get(UI_LOCALE_COOKIE)?.value;
    if (!hasLocaleCookie) {
      res.cookies.set(UI_LOCALE_COOKIE, detectLocaleFromHeader(req), {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
        sameSite: "lax",
      });
    }

    // Check auth via Supabase
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return req.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                res.cookies.set(name, value, options);
              });
            },
          },
        },
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      // Fail-open: never block on Supabase errors
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
