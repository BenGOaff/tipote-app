// lib/milestones/catalog.ts
//
// Catalogue déclaratif des milestones rétention (phase 1 de
// ROADMAP_RETENTION.md).
//
// Une `milestoneKey` est l'identifiant STABLE en DB (`user_milestones`).
// Le libellé peut évoluer, la clé non — sinon on re-débloque le milestone
// chez les users qui l'avaient déjà eu.
//
// V1 (1er juin 2026) : 7 milestones tractables sans le branchement `sale`
// (qui arrivera début phase 2). Les milestones "first_sale", "first_1k",
// "streak_7days" sont déclarés mais commentés — à activer dès que les
// events `sale` et `post_published` couvrent toute la timeline du user.
//
// Convention textuelle FR par défaut. Tipote a 5 langues UI mais pour
// les V1 toasts in-app + emails on reste FR (locale par défaut). Les
// autres langues s'ajoutent via `titleByLocale` quand besoin.

import type { BusinessEventKind } from "@/lib/businessEvents";

export type MilestoneScope = "total" | "per_project";

/**
 * Une règle de déclenchement par seuil sur un compteur d'events.
 *   - `kind` : kind d'event à compter (ex "lead_captured").
 *   - `threshold` : seuil à franchir (premier event = 1, 10e = 10, etc.).
 *   - `scope` : "total" compte sur tous les events du user (default).
 *               "per_project" compte par (user_id, project_id) — utile
 *               pour les milestones par-projet Elite.
 */
export interface MilestoneCountTrigger {
  type: "count";
  kind: BusinessEventKind;
  threshold: number;
  scope?: MilestoneScope;
}

export type MilestoneTrigger = MilestoneCountTrigger;

export interface MilestoneDefinition {
  key: string;
  emoji: string;
  title: string;
  body: string;
  emailSubject: string;
  emailHtmlBody: string;
  ctaLabel?: string;
  ctaUrl?: string;
  trigger: MilestoneTrigger;
}

const DEFAULT_CTA_URL = "/dashboard";

export const MILESTONE_CATALOG: MilestoneDefinition[] = [
  // ---- Leads ----
  {
    key: "first_lead",
    emoji: "🎯",
    title: "Ton premier lead capturé !",
    body: "Un visiteur a laissé son email sur ton quiz. Tipote vient de le tagger dans Systeme.io.",
    emailSubject: "🎯 Ton premier lead vient d'arriver",
    emailHtmlBody:
      "Un visiteur a laissé son email sur ton quiz. Tipote vient de le tagger automatiquement dans Systeme.io et il rejoint la liste de tes prospects.<br/><br/>" +
      "C'est le début d'une vraie audience. Reviens publier régulièrement pour en attirer d'autres.",
    ctaLabel: "Voir mes leads",
    ctaUrl: "/leads",
    trigger: { type: "count", kind: "lead_captured", threshold: 1 },
  },
  {
    key: "leads_10",
    emoji: "✨",
    title: "10 leads captés !",
    body: "Tu as 10 prospects qualifiés grâce à Tipote. Le palier des 100 n'est plus très loin.",
    emailSubject: "✨ 10 leads dans ta liste",
    emailHtmlBody:
      "Tu viens d'atteindre les 10 leads captés via Tipote. C'est le premier pas concret vers une audience qui te suit vraiment.<br/><br/>" +
      "Astuce : connecte un deuxième réseau social pour multiplier les sources.",
    ctaLabel: "Voir mes leads",
    ctaUrl: "/leads",
    trigger: { type: "count", kind: "lead_captured", threshold: 10 },
  },
  {
    key: "leads_100",
    emoji: "🚀",
    title: "100 leads — ton audience décolle",
    body: "100 prospects taggés dans Systeme.io. Ta machine à leads tourne.",
    emailSubject: "🚀 100 leads via Tipote",
    emailHtmlBody:
      "100 leads, c'est un vrai cap. Tu as maintenant une base utilisable pour lancer une campagne email, une promo, ou une vente flash.<br/><br/>" +
      "Le coach IA peut t'aider à imaginer le bon angle. Tu es en Pro/Elite ? Ouvre-le.",
    ctaLabel: "Ouvrir le coach IA",
    ctaUrl: "/coach",
    trigger: { type: "count", kind: "lead_captured", threshold: 100 },
  },
  {
    key: "leads_1000",
    emoji: "🏆",
    title: "1000 leads — palier de pro",
    body: "Tu fais partie des créateurs qui ont vraiment construit une audience. Bravo.",
    emailSubject: "🏆 Tu as franchi les 1000 leads",
    emailHtmlBody:
      "1000 leads via Tipote. C'est rare. Tu fais partie du petit groupe de créateurs qui ont vraiment construit une audience activable.<br/><br/>" +
      "Profite de ce palier pour lancer une offre premium, ou pour structurer une séquence d'onboarding solide. Le coach IA peut t'aider à la calibrer.",
    ctaLabel: "Voir mon dashboard",
    ctaUrl: "/dashboard",
    trigger: { type: "count", kind: "lead_captured", threshold: 1000 },
  },

  // ---- Publications ----
  {
    key: "first_post",
    emoji: "📣",
    title: "Premier post publié !",
    body: "Tu viens de publier ton premier contenu via Tipote. Ton audience attend la suite.",
    emailSubject: "📣 Ton premier post est en ligne",
    emailHtmlBody:
      "Tu viens de publier ton premier contenu via Tipote. Bienvenue dans le rythme de publication régulière, le plus dur est passé.<br/><br/>" +
      "Astuce : programme tes 3 prochains posts maintenant, pendant que tu es lancé. Tipote te tient le rythme automatiquement.",
    ctaLabel: "Programmer la suite",
    ctaUrl: "/create",
    trigger: { type: "count", kind: "post_published", threshold: 1 },
  },
  {
    key: "posts_10",
    emoji: "🔥",
    title: "10 posts publiés",
    body: "La constance commence à payer. Tipote a posté pour toi 10 fois.",
    emailSubject: "🔥 10 posts publiés via Tipote",
    emailHtmlBody:
      "10 posts publiés. C'est plus que la plupart des solos en 6 mois. Continue, c'est ce rythme-là qui crée de l'engagement.<br/><br/>" +
      "Ouvre ton analytics pour voir lequel a le mieux marché — et duplique l'angle.",
    ctaLabel: "Voir mon analytics",
    ctaUrl: "/analytics",
    trigger: { type: "count", kind: "post_published", threshold: 10 },
  },
  {
    key: "posts_100",
    emoji: "👑",
    title: "100 posts publiés — couronne créateur",
    body: "Tu as publié 100 fois avec Tipote. Tu es un vrai créateur régulier.",
    emailSubject: "👑 100 posts via Tipote",
    emailHtmlBody:
      "100 posts publiés. Tu es passé du statut de \"solo qui essaie de publier\" à celui de \"créateur régulier\". C'est le palier où les algorithmes commencent vraiment à pousser tes contenus.<br/><br/>" +
      "Si tu n'as pas encore activé les auto-commentaires, c'est le moment — ton audience est assez large maintenant pour que ça valle la peine.",
    ctaLabel: "Activer les auto-commentaires",
    ctaUrl: "/automations",
    trigger: { type: "count", kind: "post_published", threshold: 100 },
  },
];

/**
 * Retourne les milestones potentiellement déclenchables par un event
 * de ce `kind`. Filtre + tri par threshold ASC pour évaluer dans l'ordre.
 */
export function milestonesForKind(kind: BusinessEventKind): MilestoneDefinition[] {
  return MILESTONE_CATALOG.filter((m) => m.trigger.kind === kind).sort(
    (a, b) => a.trigger.threshold - b.trigger.threshold,
  );
}

/**
 * Récupère la définition d'un milestone par sa key. Retourne null si la
 * clé n'existe pas dans le catalog courant (ex retiré du catalog mais
 * encore en DB pour les users qui l'avaient).
 */
export function getMilestoneByKey(key: string): MilestoneDefinition | null {
  return MILESTONE_CATALOG.find((m) => m.key === key) ?? null;
}
