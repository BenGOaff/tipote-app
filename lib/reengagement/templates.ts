// lib/reengagement/templates.ts
//
// Templates email pour les nudges value-driven (phase 3
// ROADMAP_RETENTION.md).
//
// Ton (Béné 1er juin 2026) : décontracté, tutoiement, pratique. On aide
// on aide on aide. Pas de "tu vas perdre ton accès", pas de "ça fait X
// jours", pas de chiffres de honte. Juste une main tendue avec un CTA
// concret qui apporte de la valeur en 5 min ou moins.
//
// Personnalisation :
//   - {name} : prénom si dispo, sinon vide (l'absence se fond bien
//     dans le ton décontracté Tipote)
//   - {topPostTitle} : titre du best post — si null, fallback générique
//   - {topQuizTitle} : titre du top quiz — idem

import type { UserHighlights } from "@/lib/reengagement/detector";
import type { ReengagementBucket } from "@/lib/reengagement/detector";

export type Locale = "fr" | "en";

export interface NudgeTemplate {
  subject: string;
  greeting: string;
  htmlBody: string;
  ctaLabel: string;
  ctaPath: string;
  preheader: string;
}

interface BuildArgs {
  firstName: string;
  highlights: UserHighlights;
  locale: Locale;
}

export function buildNudgeTemplate(
  bucket: ReengagementBucket,
  args: BuildArgs,
): NudgeTemplate {
  switch (bucket) {
    case "idle_producer_7d":
      return buildIdleProducer7d(args);
    default: {
      // Future buckets — exhaustiveness check à l'ajout
      const _exhaustive: never = bucket;
      void _exhaustive;
      throw new Error(`Unknown reengagement bucket: ${String(bucket)}`);
    }
  }
}

function buildIdleProducer7d({
  firstName,
  highlights,
  locale,
}: BuildArgs): NudgeTemplate {
  const name = firstName.trim();
  const greetingLine = name ? `Salut ${name},` : "Salut,";

  if (locale === "en") {
    const recapLine = highlights.topPostTitle
      ? `Your last post (<em>${escape(highlights.topPostTitle)}</em>) did its job — that's the kind of angle we can build on.`
      : highlights.topQuizTitle
        ? `Your quiz <em>${escape(highlights.topQuizTitle)}</em> is still out there capturing leads while you focus on the rest.`
        : "Your account is loaded with everything you need — let's just press play.";
    return {
      subject: "💡 3 minutes to restart the week",
      greeting: name ? `Hi ${name},` : "Hi,",
      preheader: "No pressure — 3 ideas ready to publish in a few clicks.",
      htmlBody:
        `Quiet week on your side? Happens to everyone.<br/><br/>` +
        recapLine +
        `<br/><br/>Tipote can stage 3 post ideas in 30 seconds from your best angles. ` +
        `Pick one, tweak a line if you want, hit publish. That's it for today.`,
      ctaLabel: "Get 3 ideas",
      ctaPath: "/create",
    };
  }

  const recapLine = highlights.topPostTitle
    ? `Ton dernier post (<em>${escape(highlights.topPostTitle)}</em>) a fait son boulot — c'est typiquement le genre d'angle qu'on peut décliner.`
    : highlights.topQuizTitle
      ? `Ton quiz <em>${escape(highlights.topQuizTitle)}</em> continue de tourner pendant que tu fais autre chose — pas mal déjà.`
      : "Ton compte est prêt à servir, on a juste à appuyer sur play.";

  return {
    subject: "💡 3 minutes pour redémarrer la semaine",
    greeting: greetingLine,
    preheader: "Pas de pression — 3 idées prêtes à publier en quelques clics.",
    htmlBody:
      `Semaine plus calme côté prod ? Ça arrive à tout le monde.<br/><br/>` +
      recapLine +
      `<br/><br/>Si tu veux relancer la machine sans trop y penser, Tipote te génère 3 idées de posts en 30 secondes ` +
      `à partir de tes angles qui marchent. Tu en choisis une, tu peaufines, tu publies. Voilà, t'as fait ta journée.`,
    ctaLabel: "Voir 3 idées prêtes",
    ctaPath: "/create",
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
