// lib/support/locale.ts
//
// DANS QUELLE LANGUE ON SERT L'AIDE.
//
// Audit de l'aide, 6 août 2026. Le centre d'aide est PUBLIC, et c'est
// aussi l'aide de Tiquiz : le bouton "Aide" de la sidebar Tiquiz pointe
// sur `app.tipote.com/support/tiquiz`.
//
// Or la langue de Tipote vient du cookie `ui_locale`, que le middleware
// ne pose que sur les routes PROTÉGÉES. Une cliente Tiquiz espagnole n'a
// pas de compte Tipote, donc pas de cookie sur ce domaine : elle
// cliquait sur "Ayuda" et arrivait sur une aide en FRANÇAIS. Pas une
// traduction manquante, un repli par défaut, sur les 57 articles à la
// fois. Et rien ne le disait, ni à elle ni à nous.
//
// D'où `?lang=`, que l'app qui envoie ajoute à son lien. Elle sait dans
// quelle langue sa cliente travaille : c'est l'information la plus sûre,
// meilleure que l'entête du navigateur (une Italienne peut très bien
// avoir un Chrome en anglais).

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";

/**
 * La langue demandée si elle est valide, sinon celle déjà résolue.
 *
 * `asked` vient d'une query string, donc de n'importe qui : elle est
 * validée contre la liste, jamais utilisée telle quelle (elle sert à
 * construire un chemin d'import de messages).
 *
 * On accepte la casse libre ("PT-br") : c'est une URL écrite à la main
 * ou recopiée, et refuser sur une majuscule renverrait au bug qu'on
 * corrige.
 */
export function resolveHelpLocale(asked: unknown, fallback: string): string {
  const raw = typeof asked === "string" ? asked.trim() : "";
  if (!raw) return fallback;
  const match = (SUPPORTED_LOCALES as readonly string[]).find(
    (l) => l.toLowerCase() === raw.toLowerCase(),
  );
  return match ?? fallback;
}

/** La même chose, mais pour le middleware : null quand rien n'est demandé. */
export function askedHelpLocale(asked: unknown): SupportedLocale | null {
  const raw = typeof asked === "string" ? asked.trim() : "";
  if (!raw) return null;
  return (
    (SUPPORTED_LOCALES as readonly string[]).find(
      (l) => l.toLowerCase() === raw.toLowerCase(),
    ) as SupportedLocale | undefined
  ) ?? null;
}
