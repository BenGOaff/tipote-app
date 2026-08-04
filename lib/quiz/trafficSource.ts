// lib/quiz/trafficSource.ts
//
// D'où viennent les visiteurs d'un quiz.
//
// -- POURQUOI (audit du quiz de Jocelyne, 4 août 2026) -----------------
//
// On a fini par établir que sa vraie fuite était l'écran d'accueil :
// 142 arrivent, environ la moitié repartent sans voir une question. Et
// là on s'est arrêtés, parce qu'on ne pouvait pas répondre à la seule
// question qui compte ensuite :
//
//     est-ce que sa page d'accueil déçoit, ou est-ce que le monde qui
//     arrive dessus n'est pas le bon ?
//
// Les deux produisent exactement le même chiffre, et appellent des
// corrections opposées. Réécrire une promesse qui va très bien parce
// que le trafic vient d'un partage hors sujet, c'est encore trois
// semaines perdues. `quiz_events.meta` existe depuis mai et on n'y
// écrivait rien.
//
// -- CE QU'ON ÉCRIT, ET CE QU'ON N'ÉCRIT PAS -------------------------
//
// On enregistre une CLASSIFICATION, jamais l'adresse d'où vient la
// personne. Un referrer complet porte un chemin et une query : ça peut
// être un groupe privé, une conversation, une recherche nominative. On
// n'en a pas besoin pour répondre à la question, donc on ne le garde
// pas. Restent le nom du site (instagram, google, une newsletter) et
// les `utm_*` que la créatrice a posés elle-même sur SON lien.
//
// -- LE PIÈGE À NE PAS REFAIRE ---------------------------------------
//
// "direct" ne veut PAS dire "ils ont tapé ton adresse". La plupart des
// applications mobiles (Instagram, TikTok, Messenger, mail) n'envoient
// aucun referrer, et un QR code ou un lien dans un PDF non plus. Un
// gros "direct" est donc le cas NORMAL pour une créatrice qui publie
// sur les réseaux, pas un mystère à élucider. Toute UI et tout prompt
// qui lit ce champ doit le dire, sinon on fabrique une fausse piste,
// ce qui est précisément ce qu'on essaie d'arrêter.

import { MIN_SAMPLE } from "@/lib/quiz/funnelSignal";

/** Longueur maximale d'une valeur retenue. Au-delà, ce n'est plus un
 *  nom de source, c'est quelqu'un qui pousse des données dans notre
 *  base par le champ le plus ouvert qu'on expose. */
const MAX_VALUE = 60;

/** Clés retenues dans `quiz_events.meta`. Liste BLANCHE assumée : ici
 *  c'est du contenu envoyé par un navigateur anonyme, donc l'inverse du
 *  cas éditeur (où une liste blanche oublie toujours un champ). */
export const VISIT_META_KEYS = ["source", "utm_source", "utm_medium", "utm_campaign"] as const;

export type VisitMeta = Partial<Record<(typeof VISIT_META_KEYS)[number], string>>;

/**
 * Les familles qu'on sait nommer. Le but n'est pas d'être exhaustif :
 * un hôte inconnu est conservé tel quel (sans `www.`), ce qui suffit
 * pour reconnaître un forum de niche ou le site d'une partenaire.
 */
const KNOWN_HOSTS: { match: RegExp; source: string }[] = [
  { match: /(^|\.)instagram\.com$/, source: "instagram" },
  { match: /(^|\.)(facebook\.com|fb\.me|m\.facebook\.com)$/, source: "facebook" },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/, source: "youtube" },
  { match: /(^|\.)tiktok\.com$/, source: "tiktok" },
  { match: /(^|\.)pinterest\.[a-z.]+$/, source: "pinterest" },
  { match: /(^|\.)linkedin\.com$/, source: "linkedin" },
  { match: /(^|\.)(twitter\.com|x\.com|t\.co)$/, source: "x" },
  { match: /(^|\.)threads\.(net|com)$/, source: "threads" },
  { match: /(^|\.)reddit\.com$/, source: "reddit" },
  { match: /(^|\.)(whatsapp\.com|wa\.me)$/, source: "whatsapp" },
  { match: /(^|\.)(t\.me|telegram\.org)$/, source: "telegram" },
  { match: /(^|\.)google\.[a-z.]+$/, source: "google" },
  { match: /(^|\.)(bing\.com|duckduckgo\.com|ecosia\.org|qwant\.com|yahoo\.com)$/, source: "recherche" },
  { match: /(^|\.)(systeme\.io|systeme\.fr)$/, source: "systeme.io" },
  { match: /(^|\.)(mail\.google\.com|outlook\.[a-z.]+|mail\.yahoo\.com)$/, source: "email" },
];

/** Nettoie une valeur libre : minuscules, bornée, caractères sûrs. */
function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, MAX_VALUE)
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Classe une visite.
 *
 * Ordre de décision, et il compte :
 * 1. `utm_source` s'il est là. C'est la créatrice qui a étiqueté SON
 *    lien : elle sait mieux que nous d'où il part, et c'est la seule
 *    manière de distinguer deux publications sur le même réseau.
 * 2. le referrer, si on peut en tirer un hôte différent du nôtre.
 * 3. "direct" sinon, ce qui inclut TOUTES les applications mobiles qui
 *    n'envoient pas de referrer. Voir l'avertissement en tête de
 *    fichier : ce n'est pas "ils ont tapé l'adresse".
 *
 * Un referrer qui pointe sur notre propre domaine est ignoré : c'est
 * une navigation interne, pas une provenance.
 */
export function classifyTraffic(input: {
  referrer?: string | null;
  /** L'URL de la page courante, pour en lire les `utm_*`. */
  url?: string | null;
  /** Notre hôte, pour ne pas se compter soi-même comme source. */
  selfHost?: string | null;
}): VisitMeta {
  const out: VisitMeta = {};

  let params: URLSearchParams | null = null;
  try {
    params = input.url ? new URL(input.url).searchParams : null;
  } catch {
    params = null;
  }
  const utmSource = clean(params?.get("utm_source"));
  const utmMedium = clean(params?.get("utm_medium"));
  const utmCampaign = clean(params?.get("utm_campaign"));
  if (utmSource) out.utm_source = utmSource;
  if (utmMedium) out.utm_medium = utmMedium;
  if (utmCampaign) out.utm_campaign = utmCampaign;

  if (utmSource) {
    out.source = utmSource;
    return out;
  }

  const refHost = hostOf(String(input.referrer ?? ""));
  const self = String(input.selfHost ?? "").toLowerCase().replace(/^www\./, "");
  if (refHost && refHost !== self) {
    const known = KNOWN_HOSTS.find((k) => k.match.test(refHost));
    out.source = known ? known.source : clean(refHost) || "direct";
    return out;
  }

  out.source = "direct";
  return out;
}

/**
 * Ce que le SERVEUR accepte de garder du `meta` envoyé par le client.
 *
 * Le viewer public est du code qui tourne chez le visiteur : tout ce
 * qu'il envoie est modifiable. On ne stocke donc que des clés connues,
 * nettoyées et bornées, et on renvoie `null` quand il ne reste rien
 * plutôt qu'un objet vide (une ligne `meta = {}` ne dit rien et
 * ressemble à une donnée).
 */
export function sanitizeVisitMeta(raw: unknown): VisitMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: VisitMeta = {};
  for (const key of VISIT_META_KEYS) {
    const value = clean(src[key]);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type TrafficSlice = {
  source: string;
  count: number;
  pct: number;
};

/**
 * Regroupe les visites par source, de la plus grosse à la plus petite.
 *
 * Le dénominateur est le nombre de lignes CLASSÉES, comme partout
 * ailleurs (cf. la distribution par résultat) : les pourcentages
 * affichés somment à 100.
 */
export function summarizeTraffic(metas: readonly (VisitMeta | null | undefined)[]): TrafficSlice[] {
  const bySource = new Map<string, number>();
  let total = 0;
  for (const meta of metas) {
    const source = clean(meta?.source);
    if (!source) continue;
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    total += 1;
  }
  const out: TrafficSlice[] = [];
  for (const [source, count] of bySource) {
    out.push({ source, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 });
  }
  out.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  return out;
}

export type TrafficReading =
  /** Rien de tracé : quiz antérieur au tracking de provenance. */
  | { kind: "no-data" }
  /** Trop peu de visites classées pour en tirer quoi que ce soit. */
  | { kind: "too-few"; classified: number; needed: number }
  /** Le trafic vient d'un seul endroit : ce qui s'y passe explique tout. */
  | { kind: "single"; slices: TrafficSlice[]; top: TrafficSlice; directShare: number }
  /** Plusieurs sources : on peut comparer, donc conclure. */
  | { kind: "mixed"; slices: TrafficSlice[]; top: TrafficSlice; directShare: number };

/** Au-delà de cette part, "direct" domine tellement que la répartition
 *  ne dit plus grand-chose : les applications mobiles ont mangé les
 *  referrers, et il faut des `utm_*` pour y voir clair. */
export const DIRECT_BLIND_PCT = 70;

/** Une source seule au dessus de ça = tout le trafic vient de là. */
const SINGLE_SOURCE_PCT = 80;

/**
 * Ce qu'on a le DROIT de conclure de cette répartition.
 *
 * Même logique que `readFunnelSignal` : le verdict se calcule ici, une
 * fois, et l'écran comme le prompt se contentent de l'afficher. Sinon
 * chacun réinvente son seuil et on recommence à commenter trois
 * visiteurs.
 */
export function readTrafficSource(
  metas: readonly (VisitMeta | null | undefined)[],
): TrafficReading {
  const slices = summarizeTraffic(metas);
  const classified = slices.reduce((n, s) => n + s.count, 0);
  if (classified === 0) return { kind: "no-data" };
  if (classified < MIN_SAMPLE) {
    return { kind: "too-few", classified, needed: MIN_SAMPLE };
  }
  const top = slices[0]!;
  const directShare = slices.find((s) => s.source === "direct")?.pct ?? 0;
  const kind = top.pct >= SINGLE_SOURCE_PCT ? "single" : "mixed";
  return { kind, slices, top, directShare };
}

/**
 * La même lecture, écrite pour nos IA.
 *
 * Le point important n'est pas la liste des sources : c'est ce qu'on
 * INTERDIT d'en conclure. Un modèle qui reçoit "la moitié repart de
 * l'écran d'accueil" propose de réécrire la promesse, parce que c'est
 * le seul levier qu'on lui a donné. Si le trafic vient d'un partage
 * hors sujet, cette réécriture ne peut rien produire, et la créatrice
 * conclura que nos conseils ne servent à rien. Elle aura raison.
 *
 * On dit donc au modèle ce qu'on sait, et surtout ce qu'on ne sait pas.
 */
export function renderTrafficForPrompt(reading: TrafficReading): string {
  if (reading.kind === "no-data") {
    return [
      "PROVENANCE DES VISITEURS : inconnue (le suivi de provenance n'a encore rien enregistre sur ce quiz).",
      "- INTERDIT d'affirmer d'ou vient son trafic, ou de supposer un reseau plutot qu'un autre.",
      "- Si tu evoques une fuite a l'entree, dis les DEUX causes possibles (la page ou l'audience) et propose de les distinguer en etiquetant ses liens.",
    ].join("\n");
  }
  if (reading.kind === "too-few") {
    return [
      `PROVENANCE DES VISITEURS : trop peu de visites classees (${reading.classified}, il en faut environ ${reading.needed}).`,
      "- INTERDIT de commenter la repartition ou d'en tirer une conclusion.",
    ].join("\n");
  }

  const lines = [
    "PROVENANCE DES VISITEURS (fenetre sur les dernieres visites) :",
    ...reading.slices.map((s) => `- ${s.source} : ${s.pct}% (${s.count})`),
  ];
  if (reading.directShare >= DIRECT_BLIND_PCT) {
    lines.push(
      `- ATTENTION : ${reading.directShare}% arrivent sans provenance. Ce n'est PAS "ils ont tape l'adresse" : les applications mobiles (Instagram, TikTok, messageries, mail), les QR codes et les liens dans un PDF ne transmettent rien. La repartition ci-dessus est donc partielle, ne conclus pas dessus. Propose d'etiqueter les liens (utm_source) pour y voir clair.`,
    );
  } else if (reading.directShare > 0) {
    lines.push(
      `- "direct" (${reading.directShare}%) n'est pas "ils ont tape l'adresse" : les applications mobiles ne transmettent pas la provenance. Ne le presente jamais comme un mystere ni comme du trafic de mauvaise qualite.`,
    );
  }
  lines.push(
    reading.kind === "single"
      ? `- Tout le trafic vient de ${reading.top.source} (${reading.top.pct}%). Une fuite a l'entree se lit donc CONTRE ce public la : le premier soupcon est l'ecart entre ce qui a ete promis la-bas et ce que le visiteur trouve en arrivant, avant toute reecriture de la page.`
      : "- Le trafic vient de plusieurs sources. Si l'une demarre nettement mieux que les autres, ce n'est pas la page qui coince mais l'audience de la source la plus faible : dis-le, c'est une correction beaucoup moins couteuse qu'une refonte.",
  );
  return lines.join("\n");
}
