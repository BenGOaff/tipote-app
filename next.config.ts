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
        // ATTENTION : ne pas catch /_next/, /api/ ou /affiliate/ lui-même
        // sinon les assets statiques (CSS/JS) sont rewrités en
        // /affiliate/_next/... qui n'existe pas → 404 sur toute la page.
        // Les trois premières règles sont des pass-through (destination
        // identique au source) qui matchent et stoppent la chaîne avant
        // la règle catch-all.
        {
          source: "/_next/:path*",
          has: [{ type: "host", value: "affiliate.tipote.com" }],
          destination: "/_next/:path*",
        },
        {
          source: "/api/:path*",
          has: [{ type: "host", value: "affiliate.tipote.com" }],
          destination: "/api/:path*",
        },
        {
          source: "/affiliate/:path*",
          has: [{ type: "host", value: "affiliate.tipote.com" }],
          destination: "/affiliate/:path*",
        },
        // Catch-all : toutes les autres routes sur affiliate.tipote.com
        // sont rewritées en /affiliate/*. C'est ça qui fait que
        // affiliate.tipote.com/login → app/affiliate/login/page.tsx.
        {
          source: "/:path*",
          has: [{ type: "host", value: "affiliate.tipote.com" }],
          destination: "/affiliate/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);

