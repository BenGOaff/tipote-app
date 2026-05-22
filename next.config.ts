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
        //   - /_next/  : assets statiques Next.js
        //   - /api/    : routes API (gardent leur path d'origine)
        //   - /affiliate/ : déjà sous /affiliate, pas de double-rewrite
        //   - /favicon.ico : route handler dynamique au root
        //
        // Le précédent essai avec des règles pass-through `source:
        // "/_next/:path*" destination: "/_next/:path*"` ne matchait
        // PAS les chemins multi-segments (path-to-regexp v6 a un
        // comportement subtil avec :path* à la fin). Résultat : tous
        // les chunks JS/CSS étaient rewrités en /affiliate/_next/...
        // qui n'existe pas → 404 sur toute la page.
        {
          source: "/:path((?!_next|api|affiliate|favicon\\.ico).*)",
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

