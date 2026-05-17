// lib/publicSlug.ts
//
// Shared rules around the slug that ends up in a public URL — both
// on the main host (app.tipote.com/q/<slug>) and on a creator's
// custom domain (test.ethilife.fr/<slug>, no /q/ prefix).
//
// Two concerns live here:
//
//   1. RESERVED words. On a custom domain the slug sits at the root
//      of the URL space, so a slug like "api", "embed" or "robots.txt"
//      would silently shadow real routes and break the creator's
//      site. We refuse them at save time.
//
//   2. Cross-type uniqueness. Tipote has 3 public content types
//      (quizzes, popquizzes, hosted_pages). On a custom domain
//      they share the root URL space, so a slug can only exist on
//      ONE of the three for a given user — otherwise the catch-all
//      route at app/[publicSlug] couldn't pick. Surfaced as a clear
//      SLUG_TAKEN error before write.
//
// The actual SQL lookups live in lib/publicSlugServer.ts so this file
// stays safe to import from Edge runtime / client code.

/** Slugs that would collide with Next routes, infra hostnames, or
 *  files browsers expect to find at the root. Lowercase, exact match.
 *  Synced with the top-level folders under `app/` — when you add a
 *  new top-level route, add its segment here so a creator can't
 *  shadow it via a slug. */
export const RESERVED_PUBLIC_SLUGS: ReadonlySet<string> = new Set([
  // Next / framework
  "_next",
  "api",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "manifest.webmanifest",
  // Public-content prefixes (would shadow them on the main host, or
  // look confusing on a custom domain where /<slug> is the expected
  // shape — the catch-all already serves these types without prefix)
  "q", "p", "pq",
  // Existing Tipote app routes (every top-level dir under app/)
  "embed",
  "app",
  "admin",
  "analytics",
  "auth",
  "automations",
  "clients",
  "contents",
  "create",
  "dashboard",
  "leads",
  "legal",
  "meta",
  "onboarding",
  "pages",
  "pepites",
  "popquiz", "popquizzes",
  "quiz", "quizzes",
  "settings",
  "strategy",
  "support",
  "survey",
  "tasks",
  "templates",
  "webinars",
  "widgets",
  // Auth-y / common
  "login", "signup", "logout",
  // Web-standard "well-known" prefix
  ".well-known",
]);

export function isReservedPublicSlug(slug: string): boolean {
  return RESERVED_PUBLIC_SLUGS.has(slug.toLowerCase());
}
