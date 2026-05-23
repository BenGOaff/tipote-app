import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Embeddable widget JS — must be publicly cacheable and CORS-enabled
        // so external blogs (Systeme.io, WordPress, etc.) can load it.
        source: "/widgets/:file*.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // affiliate.tipote.com → /affiliate/*
        // Pattern officiel Next.js avec negative lookahead pour exclure
        // les paths qui ne doivent PAS être rewrités :
        //   - /_next/    : assets statiques Next.js
        //   - /api/      : routes API (gardent leur path d'origine)
        //   - /affiliate/: déjà sous /affiliate, pas de double-rewrite
        //   - /favicon*  : favicon.ico (route handler dynamique) +
        //                  favicon.png + variantes (favicon-32x32.png etc)
        //   - /robots.txt, /sitemap.xml : static files au root
        //
        // ⚠️ NE PAS oublier d'ajouter ici toute nouvelle URL statique
        // qu'on poserait au root du domaine — sinon elle est rewrite
        // en /affiliate/<file> qui n'existe pas → 404.
        {
          source: "/:path((?!_next|api|affiliate|favicon|robots\\.txt|sitemap\\.xml).*)",
          has: [{ type: "host", value: "affiliate.tipote.com" }],
          destination: "/affiliate/:path",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);

