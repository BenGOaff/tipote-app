// app/robots.ts
//
// Politique de crawl pour les bots (Google, Bing, etc.). Bloque tout
// ce qui est privé (dashboard, settings, admin, API) et autorise les
// pages publiques (/q/<id>, /p/<slug>, /pq/<id>, et les bare slugs
// servis sur custom domains).
//
// /api/track est volontairement DISALLOW pour pas que les bots
// déclenchent des events analytics fantômes.

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://app.tipote.com").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/quiz/",
          "/popquiz/",
          "/leads",
          "/stats",
          "/settings",
          "/admin",
          "/boost",
          "/onboarding",
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
