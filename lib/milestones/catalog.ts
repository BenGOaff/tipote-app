// lib/milestones/catalog.ts
//
// Catalogue déclaratif des milestones rétention (phase 1 de
// ROADMAP_RETENTION.md).
//
// Une `milestoneKey` est l'identifiant STABLE en DB (`user_milestones`).
// Le libellé peut évoluer, la clé non, sinon on re-débloque le milestone
// chez les users qui l'avaient déjà eu.
//
// V1 (1er juin 2026) : 7 milestones tractables sans le branchement `sale`
// (qui arrivera début phase 2). Les milestones "first_sale", "first_1k",
// "streak_7days" sont déclarés mais commentés, à activer dès que les
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
 *               "per_project" compte par (user_id, project_id), utile
 *               pour les milestones par-projet Elite.
 */
export interface MilestoneCountTrigger {
  type: "count";
  kind: BusinessEventKind;
  threshold: number;
  scope?: MilestoneScope;
}

/**
 * Palier de CA cumulé (en centimes, monnaie ORIGINALE de la transaction
 *, pas de conversion devise V1). Trigger appelé quand le kind `sale`
 * est observé : engine somme `transactions.amount_cents - refunded_cents`
 * via `sumSalesForUser` et débloque si cumul ≥ threshold.
 */
export interface MilestoneMonetaryTrigger {
  type: "monetary_threshold";
  kind: "sale";
  thresholdCents: number;
  scope?: MilestoneScope;
}

export type MilestoneTrigger = MilestoneCountTrigger | MilestoneMonetaryTrigger;

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
    title: "100 leads, ton audience décolle",
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
    title: "1000 leads, palier de pro",
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
      "Ouvre ton analytics pour voir lequel a le mieux marché, et duplique l'angle.",
    ctaLabel: "Voir mon analytics",
    ctaUrl: "/analytics",
    trigger: { type: "count", kind: "post_published", threshold: 10 },
  },
  {
    key: "posts_100",
    emoji: "👑",
    title: "100 posts publiés, couronne créateur",
    body: "Tu as publié 100 fois avec Tipote. Tu es un vrai créateur régulier.",
    emailSubject: "👑 100 posts via Tipote",
    emailHtmlBody:
      "100 posts publiés. Tu es passé du statut de \"solo qui essaie de publier\" à celui de \"créateur régulier\". C'est le palier où les algorithmes commencent vraiment à pousser tes contenus.<br/><br/>" +
      "Si tu n'as pas encore activé les auto-commentaires, c'est le moment, ton audience est assez large maintenant pour que ça valle la peine.",
    ctaLabel: "Activer les auto-commentaires",
    ctaUrl: "/automations",
    trigger: { type: "count", kind: "post_published", threshold: 100 },
  },

  // ---- Ventes (compteur) ----
  // amount_cents stocké en monnaie ORIGINALE de la transaction (pas de
  // conversion V1). Les paliers monétaires assument que la grande
  // majorité des users Tipote vendent en EUR ; pour un user en USD/CHF
  // exclusif, le palier "1k€" se déclenchera quand son cumul brut atteint
  // 100 000 centimes, soit ~1k USD ou ~1k CHF. Acceptable V1.
  {
    key: "first_sale",
    emoji: "💶",
    title: "Première vente synchronisée !",
    body: "Une vente vient d'apparaître dans ta compta Tipote. Ton business commence à tourner.",
    emailSubject: "💶 Ta première vente est trackée",
    emailHtmlBody:
      "Une vente vient d'être synchronisée dans ta compta Tipote (Stripe / PayPal / Mollie / Systeme.io). Tu vas pouvoir suivre ton CA réel mois par mois, comparer N-1, et calibrer ton coach IA sur tes vrais chiffres.<br/><br/>" +
      "Ouvre l'onglet Compta pour voir le détail.",
    ctaLabel: "Voir ma compta",
    ctaUrl: "/settings?tab=compta",
    trigger: { type: "count", kind: "sale", threshold: 1 },
  },
  {
    key: "sales_10",
    emoji: "💼",
    title: "10 ventes, c'est une vraie activité",
    body: "Tipote a trackée tes 10 premières ventes. Le moteur tourne.",
    emailSubject: "💼 10 ventes trackées",
    emailHtmlBody:
      "10 ventes synchronisées. Tu as une vraie activité régulière maintenant. Bonne nouvelle : Tipote sait isoler tes ventes directes de tes commissions d'affiliation, et calculer ton seuil franchise TVA si tu es auto-entrepreneur.<br/><br/>" +
      "Profite de ce moment pour vérifier ton statut fiscal côté Compta, c'est aussi à 10 ventes qu'on commence à oublier les bons réglages au début.",
    ctaLabel: "Voir ma compta",
    ctaUrl: "/settings?tab=compta",
    trigger: { type: "count", kind: "sale", threshold: 10 },
  },
  {
    key: "sales_100",
    emoji: "🏗️",
    title: "100 ventes, solo qui scale",
    body: "100 transactions synchronisées. Tu as construit quelque chose de vrai.",
    emailSubject: "🏗️ 100 ventes via tes outils",
    emailHtmlBody:
      "100 ventes synchronisées dans ta compta Tipote. Tu fais partie du petit groupe de solos qui ont construit une vraie machine business régulière.<br/><br/>" +
      "Le coach IA peut maintenant t'aider à identifier ce qui marche le mieux (offre la plus rentable, source qui convertit, etc.). Ouvre-le, il a accès à tes chiffres en temps réel.",
    ctaLabel: "Ouvrir le coach IA",
    ctaUrl: "/coach",
    trigger: { type: "count", kind: "sale", threshold: 100 },
  },

  // ---- Ventes (palier monétaire cumulé) ----
  {
    key: "sales_first_1k_eur",
    emoji: "🥉",
    title: "Premier 1 000 € de CA",
    body: "Ton CA cumulé via tes outils Tipote vient de franchir les 1 000 €.",
    emailSubject: "🥉 1 000 € de CA tracké",
    emailHtmlBody:
      "1 000 € de CA cumulé, c'est le premier vrai palier psychologique pour un solopreneur. Tu n'es plus en \"je teste\", tu es en \"j'opère\".<br/><br/>" +
      "Prochain palier ciblé par Tipote : 5 000 €. Si tu n'as pas encore fixé d'objectif de revenu mensuel dans tes paramètres, c'est le moment, la jauge sur le dashboard te rendra l'effort beaucoup plus motivant.",
    ctaLabel: "Configurer mon objectif",
    ctaUrl: "/strategy",
    trigger: { type: "monetary_threshold", kind: "sale", thresholdCents: 100_000 },
  },
  {
    key: "sales_first_5k_eur",
    emoji: "🥈",
    title: "5 000 € de CA, palier d'un vrai business",
    body: "Tu as cumulé 5 000 € de ventes synchronisées via Tipote.",
    emailSubject: "🥈 5 000 € de CA cumulé",
    emailHtmlBody:
      "5 000 € de CA cumulé. Tu es au-dessus du seuil de la franchise TVA pour beaucoup d'activités, si tu es auto-entrepreneur, la jauge dans Compta te dira où tu en es exactement.<br/><br/>" +
      "Continue, le palier 10 000 € est dans la même mécanique : tes contenus tournent, tu publies régulièrement, tu factures.",
    ctaLabel: "Voir ma compta",
    ctaUrl: "/settings?tab=compta",
    trigger: { type: "monetary_threshold", kind: "sale", thresholdCents: 500_000 },
  },
  {
    key: "sales_first_10k_eur",
    emoji: "🥇",
    title: "10 000 € de CA cumulé",
    body: "Cinq chiffres en CA cumulé via Tipote. Sérieusement, bravo.",
    emailSubject: "🥇 10 000 € de CA",
    emailHtmlBody:
      "10 000 € de CA cumulé via tes outils Tipote. C'est le palier où la majorité des solos abandonnent, toi tu l'as passé.<br/><br/>" +
      "Si tu es seul et que tu commences à plafonner sur le temps, c'est aussi le moment de penser à un palier d'offre supérieur (high ticket, abonnement, communauté). Le coach IA peut t'aider à dessiner ça.",
    ctaLabel: "Ouvrir le coach IA",
    ctaUrl: "/coach",
    trigger: { type: "monetary_threshold", kind: "sale", thresholdCents: 1_000_000 },
  },

  // ---- Complétions de quiz ----
  {
    key: "first_quiz_complete",
    emoji: "✅",
    title: "Premier visiteur qui finit ton quiz",
    body: "Un visiteur vient de terminer un de tes quiz jusqu'au bout.",
    emailSubject: "✅ Ton premier quiz complété",
    emailHtmlBody:
      "Un visiteur a fini l'un de tes quiz jusqu'au résultat. Ce n'est pas juste une vue, c'est quelqu'un qui s'est engagé du début à la fin.<br/><br/>" +
      "Si tu n'as pas encore activé la capture email avant le résultat, c'est le moment : tu transformes ces complétions en leads.",
    ctaLabel: "Voir mes quiz",
    ctaUrl: "/quizzes",
    trigger: { type: "count", kind: "quiz_complete", threshold: 1 },
  },
  {
    key: "quiz_completes_100",
    emoji: "🎓",
    title: "100 quiz complétés",
    body: "Tes quiz ont été finis 100 fois. Ton lead magnet fonctionne.",
    emailSubject: "🎓 100 complétions de quiz",
    emailHtmlBody:
      "100 visiteurs ont fini l'un de tes quiz jusqu'au bout. C'est un vrai signal de qualité, tu retiens l'attention.<br/><br/>" +
      "Ouvre tes analytics pour voir lequel performe le mieux et duplique l'angle dans tes prochains contenus.",
    ctaLabel: "Voir mon analytics",
    ctaUrl: "/analytics",
    trigger: { type: "count", kind: "quiz_complete", threshold: 100 },
  },
  {
    key: "quiz_completes_1000",
    emoji: "🏟️",
    title: "1000 quiz complétés",
    body: "Mille visiteurs sont allés jusqu'au bout. Tu as une mécanique qui scale.",
    emailSubject: "🏟️ 1000 complétions de quiz",
    emailHtmlBody:
      "1000 complétions de quiz. C'est très rare. Tu as construit une mécanique de capture qui fonctionne vraiment, la plupart des créateurs ne dépassent pas 100.<br/><br/>" +
      "Profite de ce palier pour vendre une offre à partir du résultat le plus populaire, la conversion est généralement excellente sur les visiteurs qui finissent un quiz.",
    ctaLabel: "Voir mes quiz",
    ctaUrl: "/quizzes",
    trigger: { type: "count", kind: "quiz_complete", threshold: 1000 },
  },

  // ---- Partages (viralité) ----
  {
    key: "first_quiz_share",
    emoji: "📤",
    title: "Premier partage de ton quiz",
    body: "Un visiteur vient de partager son résultat sur un réseau. La viralité démarre.",
    emailSubject: "📤 Ton premier partage de quiz",
    emailHtmlBody:
      "Un visiteur a partagé son résultat de quiz. C'est la mécanique de viralité Tiquiz/Tipote qui se déclenche : son réseau peut maintenant cliquer et finir le quiz à son tour, sans que tu aies rien à faire.<br/><br/>" +
      "Astuce : configure un \"bonus de partage\" si ce n'est pas déjà fait, ça multiplie les partages.",
    ctaLabel: "Configurer le bonus de partage",
    ctaUrl: "/quizzes",
    trigger: { type: "count", kind: "quiz_share", threshold: 1 },
  },
  {
    key: "quiz_shares_100",
    emoji: "📣",
    title: "100 partages de quiz",
    body: "Tes visiteurs ont relayé tes quiz 100 fois. Effet boule de neige.",
    emailSubject: "📣 100 partages de quiz",
    emailHtmlBody:
      "100 partages de quiz. Tes contenus se propagent dans des réseaux que tu ne contrôles pas. C'est la définition même d'un lead magnet qui marche.<br/><br/>" +
      "Si tu as branché un tag Systeme.io spécifique sur l'étape de partage, c'est le moment de vérifier que ta séquence d'email post-partage est bien calibrée, ces leads sont chauds.",
    ctaLabel: "Voir mes leads",
    ctaUrl: "/leads",
    trigger: { type: "count", kind: "quiz_share", threshold: 100 },
  },
];

/**
 * Retourne la valeur seuil normalisée d'un trigger pour le tri /
 * comparaison cross-type. Sépare count vs monetary_threshold dans le
 * tri pour ne pas mélanger 100 (= 100 events) avec 100_000 (= 1k€ en
 * centimes).
 */
export function milestoneThreshold(trigger: MilestoneTrigger): number {
  return trigger.type === "monetary_threshold"
    ? trigger.thresholdCents
    : trigger.threshold;
}

/**
 * Retourne les milestones potentiellement déclenchables par un event
 * de ce `kind`. Filtre + tri ASC par seuil DANS chaque type
 * (count d'abord, monetary_threshold ensuite) pour que l'engine puisse
 * break dès qu'il dépasse le seuil sans risque de skip un trigger
 * d'un autre type.
 */
export function milestonesForKind(kind: BusinessEventKind): MilestoneDefinition[] {
  return MILESTONE_CATALOG.filter((m) => m.trigger.kind === kind).sort((a, b) => {
    if (a.trigger.type !== b.trigger.type) {
      return a.trigger.type === "count" ? -1 : 1;
    }
    return milestoneThreshold(a.trigger) - milestoneThreshold(b.trigger);
  });
}

/**
 * Récupère la définition d'un milestone par sa key. Retourne null si la
 * clé n'existe pas dans le catalog courant (ex retiré du catalog mais
 * encore en DB pour les users qui l'avaient).
 */
export function getMilestoneByKey(key: string): MilestoneDefinition | null {
  return MILESTONE_CATALOG.find((m) => m.key === key) ?? null;
}
