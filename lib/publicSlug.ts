// lib/publicSlug.ts
//
// Ce qu'une créatrice a le droit d'écrire dans l'adresse publique de son
// contenu, et ce qu'un domaine perso a le droit de servir. Deux questions
// voisines, longtemps confondues, et c'est la confusion qui coûtait cher.
//
// -- LE MOT "quiz" ÉTAIT INTERDIT (retour Béné, 4 août 2026) ------------
//
// "On ne peut pas blacklister le mot 'quiz' parce que beaucoup vont
// l'utiliser. C'est LOGIQUE." Elle a raison, et la liste en interdisait
// une trentaine d'autres du même genre : contents, pages, dashboard,
// leads, settings, support... c'est à dire les mots les plus naturels du
// monde pour nommer un contenu.
//
// Aucun de ces mots ne gênait qui que ce soit. Ils étaient là parce que
// la liste servait DEUX choses à la fois :
//
//   1. "ce slug masquerait une de nos pages" ;
//   2. "ce chemin ne doit pas être servi sur le domaine d'une cliente".
//
// Or le point 2 est déjà réglé, et bien mieux, par la porte du
// middleware : sur un domaine perso, TOUT ce qui n'est pas explicitement
// autorisé répond 404. Nos pages n'y sont donc jamais accessibles. En
// gardant leurs noms dans la liste, on interdisait à la créatrice des
// mots qui ne pouvaient déjà plus rien masquer chez elle.
//
// Restait un vrai risque : sur son domaine, `example.com/quiz` était
// résolu par le routeur Next comme n'importe quelle URL, et une route
// statique gagne toujours contre une route dynamique. Un contenu nommé
// "quiz" serait donc tombé sur notre page, ou sur un 404.
//
// D'où la vraie correction, qui vit dans le middleware : le slug nu d'un
// domaine perso est RÉÉCRIT vers `/s/<slug>`, un chemin qui n'est pas une
// page de l'app. Le routeur n'a plus d'arbitrage à rendre, donc plus
// aucun de nos noms de pages n'a besoin d'être interdit.
//
// L'unicité entre les 3 types de contenu public (quizzes, popquizzes,
// hosted_pages) reste entière : elle vit dans lib/publicSlugServer.ts et
// n'a rien à voir avec les mots réservés. Sur un domaine perso les trois
// partagent la racine, donc un slug ne peut exister que sur UN des trois
// pour une créatrice donnée, sinon le catch-all ne saurait pas choisir.
//
// Les lookups SQL vivent dans lib/publicSlugServer.ts pour que ce fichier
// reste importable depuis le runtime Edge et depuis le runner de tests.

/**
 * Slugs refusés à l'enregistrement.
 *
 * `sanitizeSlug` (lib/quizBranding.ts) ne laisse passer que [a-z0-9-] :
 * ni point, ni underscore. `_next`, `.well-known`, `favicon.ico`,
 * `robots.txt` et compagnie sont donc DÉJÀ impossibles à saisir. On ne
 * les répète pas ici : une liste qui protège de l'impossible donne
 * l'illusion de protéger de quelque chose.
 *
 * Ne reste que le préfixe d'API, gardé par prudence : c'est le seul
 * segment nu qui pourrait un jour devenir une page réelle servie sur un
 * domaine perso (la porte du middleware ouvre déjà `/api/quiz/...`,
 * `/api/pages/...` et `/api/leads`).
 */
export const RESERVED_PUBLIC_SLUGS: ReadonlySet<string> = new Set(["api"]);

export function isReservedPublicSlug(slug: string): boolean {
  return RESERVED_PUBLIC_SLUGS.has(slug.toLowerCase());
}

/** Segment interne vers lequel le middleware réécrit le slug nu d'un
 *  domaine perso. Ce n'est PAS une URL publique : on n'y arrive que par
 *  réécriture, jamais en la tapant (la porte ci-dessous la refuse). */
export const TENANT_SLUG_PREFIX = "/s";

/** Forme d'un slug servi à la racine d'un domaine perso. Miroir de
 *  `SLUG_RE` / `sanitizeSlug` : la porte ne laisse jamais passer un
 *  chemin sur lequel la page finirait de toute façon en 404. */
const BARE_SLUG_RE = /^\/[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

/** Chemins servis tels quels sur un domaine perso. Tout le reste répond
 *  404 : le tableau de bord, l'admin, la connexion, les pages de vente
 *  n'existent pas sur le domaine d'une cliente. */
const TENANT_PASSTHROUGH_PREFIXES = [
  "/q/",
  "/p/",
  "/pq/",
  "/embed/",
  "/api/quiz/",
  "/api/popquiz/",
  "/api/pages/",
  "/api/leads",
  "/_next/",
];

const TENANT_PASSTHROUGH_EXACT = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
]);

export type TenantRoute =
  /** Servir le chemin tel quel. */
  | { kind: "pass" }
  /** Réécrire vers `${TENANT_SLUG_PREFIX}/${slug}` : c'est un contenu. */
  | { kind: "slug"; slug: string }
  /** 404 : ce chemin n'appartient pas au domaine d'une cliente. */
  | { kind: "block" };

/**
 * Décide ce qu'un domaine perso fait d'un chemin. Fonction pure, testée :
 * c'est elle qui garantit à la fois qu'aucune de nos pages ne fuite chez
 * une cliente, et qu'aucun mot ne lui est interdit sans raison.
 */
export function routeTenantPath(pathname: string): TenantRoute {
  if (pathname === "/") return { kind: "pass" };
  if (TENANT_PASSTHROUGH_EXACT.has(pathname)) return { kind: "pass" };
  if (TENANT_PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return { kind: "pass" };
  }
  // Assets statiques de /public (logo du footer, image de fond...). Un
  // fichier avec extension n'est jamais un slug : `sanitizeSlug` interdit
  // le point.
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return { kind: "pass" };

  if (BARE_SLUG_RE.test(pathname)) {
    const slug = pathname.slice(1);
    if (!isReservedPublicSlug(slug)) return { kind: "slug", slug };
  }
  return { kind: "block" };
}
