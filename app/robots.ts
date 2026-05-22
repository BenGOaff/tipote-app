// app/robots.ts — host-aware (cf. sitemap.ts).
//
// Sur main host (app.tipote.com) : robots avec disallow des paths
// privés + sitemap pointant vers app.tipote.com/sitemap.xml.
//
// Sur custom domain user : robots minimal — le middleware bloque déjà
// tous les paths non-publics avec 404. Le sitemap pointe vers le
// sitemap user-scoped servi par le même host.

import type { MetadataRoute } from "next";
import { headers } from "next/headers";

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const customHost = h.get(CUSTOM_HOST_HEADER);

  if (customHost) {
    const base = `https://${customHost.toLowerCase().trim()}`;
    return {
      rules: [{ userAgent: "*", allow: "/" }],
      sitemap: `${base}/sitemap.xml`,
      host: base,
    };
  }

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
