import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // `pdf-parse` charge son worker par un import DYNAMIQUE calculé à
  // l'exécution (`pdf.worker.mjs`). Bundlé, le code part bien mais le
  // fichier worker ne suit pas, et l'import PDF échoue en prod avec
  // "Setting up fake worker failed" alors que tout est vert en local et
  // que le build ne dit rien. Le laisser EXTERNE le fait charger depuis
  // node_modules, où son worker est à côté de lui.
  //
  // Les DEUX réglages sont nécessaires : sans le premier le worker est
  // cherché au mauvais endroit, sans le second Next ne le copie pas dans
  // la sortie standalone (il trace les imports qu'il VOIT, et celui-là
  // est construit à l'exécution).
  //
  // Vérifié le 7 août 2026 en envoyant un vrai PDF au serveur de
  // production : cassé sans ces lignes, correct avec.
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
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

