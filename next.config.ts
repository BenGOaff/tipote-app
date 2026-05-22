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
        // affiliate.tipote.com → toutes les routes deviennent /affiliate/*
        // Pattern recommandé par Next.js pour le subdomain-to-path mapping
        // (cf. docs sur le multi-tenant). Plus fiable qu'un middleware
        // NextResponse.rewrite qui en Next 16 essaie un fetch externe et
        // crashe en EPROTO sur localhost:3000.
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

