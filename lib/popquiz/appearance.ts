// lib/popquiz/appearance.ts
//
// Helpers de rendu de l'apparence d'un popquiz public — partagés
// entre la page directe (/pq/[id]) et l'embed iframe (/embed/pq/[id])
// pour garantir un rendu identique. Toute la logique de mapping
// "user settings → CSS" vit ici.

import type { CSSProperties } from "react";
import type { PopquizAppearance } from "./types";

/** Style appliqué à la page complète (bg color/gradient ou
 *  transparent). Quand `transparent`, on retourne juste un objet
 *  vide pour ne pas écraser un éventuel default Tailwind. */
export function buildPageBackgroundStyle(
  appearance: PopquizAppearance,
): CSSProperties {
  if (appearance.bgStyle === "solid" && appearance.bgColor) {
    return { background: appearance.bgColor };
  }
  if (
    appearance.bgStyle === "gradient" &&
    appearance.bgColor &&
    appearance.bgColor2
  ) {
    return {
      background: `linear-gradient(135deg, ${appearance.bgColor} 0%, ${appearance.bgColor2} 100%)`,
    };
  }
  // Transparent par défaut → laisse passer le fond noir de la page
  // ou le fond de l'iframe parent. Rendu propre.
  return { background: "#000" };
}

/** Classes Tailwind appliquées au wrapper du player. On gère les
 *  ombres ici parce que les classes shadow-{soft,medium,strong}
 *  sont des constantes ; les couleurs/épaisseurs de bordure passent
 *  par le style inline. */
export function buildPlayerWrapperClassName(
  appearance: PopquizAppearance,
): string {
  const parts = ["relative w-full overflow-hidden rounded-2xl"];
  switch (appearance.shadowIntensity) {
    case "soft":
      parts.push("shadow-md shadow-black/30");
      break;
    case "medium":
      parts.push("shadow-xl shadow-black/40");
      break;
    case "strong":
      parts.push("shadow-2xl shadow-black/60");
      break;
    case "none":
    default:
      break;
  }
  return parts.join(" ");
}

/** Bordure inline (épaisseur + couleur). null → pas de border. */
export function buildPlayerWrapperStyle(
  appearance: PopquizAppearance,
): CSSProperties {
  if (appearance.borderWidth > 0 && appearance.borderColor) {
    return {
      border: `${appearance.borderWidth}px solid ${appearance.borderColor}`,
    };
  }
  return {};
}

/** URL d'affiliation Tiquiz côté tipote.fr. Si le créateur a posé
 *  son ID affilié SIO dans Settings, on attache ?sa=<id> pour qu'il
 *  touche une commission sur les inscriptions qui découlent de ce
 *  popquiz. Sinon, lien direct (non tracké mais fonctionnel). */
export function tiquizDiscoveryUrl(affiliateId: string | null | undefined): string {
  const base = "https://www.tipote.fr/part-tiquiz";
  if (!affiliateId) return base;
  return `${base}?sa=${encodeURIComponent(affiliateId)}`;
}
