"use client";

// hooks/useEchecIa.ts
//
// TRADUIRE LA RAISON D'UN ÉCHEC IA, DANS LES 7 LANGUES.
//
// Le serveur renvoie une RAISON (`lib/ia/echecIa.ts`), jamais une
// phrase : l'interface existe en 7 langues, et une phrase écrite dans le
// code y arrive forcément dans une seule (c'est la faute des replis
// "Résultat 4" du 1er septembre).
//
// UNE RAISON INCONNUE RETOMBE SUR `generic`, elle n'affiche JAMAIS sa
// clé. Un écran resté sur une ancienne version, ou une raison ajoutée
// côté serveur avant que les traductions ne soient déployées, montrerait
// sinon `not_configured` en toutes lettres à une créatrice.

import { useTranslations } from "next-intl";

/** Les raisons que les 7 fichiers de `messages/` savent dire. */
const CONNUES = new Set([
  "busy",
  "too_long",
  "refused",
  "unreachable",
  "empty",
  "unreadable",
  "rate_limited",
  "not_configured",
  "generic",
]);

export function useEchecIa() {
  const t = useTranslations("erreursIa");
  return (raison: string | null | undefined) =>
    t(CONNUES.has(String(raison)) ? String(raison) : "generic");
}
