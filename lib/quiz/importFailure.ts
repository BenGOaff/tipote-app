// lib/quiz/importFailure.ts
//
// POURQUOI UN IMPORT ÉCHOUE, DIT EN UNE RAISON QUE L'ÉCRAN SAIT TRADUIRE.
//
// François Xavier, 7 août 2026 : "Quand j'importe le quiz au format pdf,
// j'ai ce message d'erreur : Erreur lors de la lecture du fichier :
// r is not a function."
//
// -- LA PHRASE QU'IL A LUE N'ÉTAIT PAS ÉCRITE POUR LUI ------------------
//
// `r is not a function` est un message d'exception JavaScript, avec un
// nom de variable MINIFIÉ par le compilateur. Il ne décrit pas son
// fichier, il décrit notre code. On le lui a montré parce que la route
// recopiait `error.message` dans le toast.
//
// Ça coûte deux fois. Lui ne peut rien en faire : il ne sait pas s'il
// doit réexporter son PDF, retirer un mot de passe, ou nous écrire. Et
// nous non plus : le vrai symptôme (l'API de la librairie PDF a changé)
// était noyé dans une phrase qui ressemblait à un problème de fichier.
//
// **Règle : le serveur renvoie une RAISON, jamais une phrase.** L'écran
// la traduit, dans les 7 langues de l'interface. C'est la même règle que
// pour la suppression d'un quiz (drame du 3 août) : le serveur dit ce
// qui s'est passé, l'interface dit comment le dire.

/** Les raisons possibles d'un import raté. Une raison = une clé i18n. */
export const IMPORT_FAILURE_REASONS = [
  "file_too_large",
  "empty_file",
  "unsupported_format",
  "docx_no_text",
  "pdf_no_text",
  "pdf_password",
  "pdf_damaged",
  "extract_failed",
] as const;

export type ImportFailureReason = (typeof IMPORT_FAILURE_REASONS)[number];

/**
 * Ramène ce que le serveur a renvoyé à une raison connue.
 *
 * Le client traduit la raison par une clé i18n. Une valeur inattendue
 * (serveur plus récent que la page ouverte, réponse tronquée par un
 * proxy) donnerait alors une clé absente, donc un toast vide ou le nom
 * brut de la clé à l'écran. On retombe sur `extract_failed`, qui dit au
 * moins quoi faire.
 */
export function asImportFailureReason(value: unknown): ImportFailureReason {
  return IMPORT_FAILURE_REASONS.includes(value as ImportFailureReason)
    ? (value as ImportFailureReason)
    : "extract_failed";
}

/**
 * Traduit une exception de la librairie PDF en raison exploitable.
 *
 * On classe sur `error.name`, jamais sur `instanceof` : un bundler qui
 * duplique un module donne deux classes différentes pour le même nom, et
 * `instanceof` répond alors faux sans que rien ne le signale. Le nom, lui,
 * survit au bundling comme à la minification.
 *
 * Tout ce qu'on ne sait pas nommer retombe sur `extract_failed`, dont le
 * texte propose une porte de sortie (réexporter en .docx) plutôt que de
 * décrire une panne que la créatrice ne peut pas réparer.
 */
export function classifyPdfError(error: unknown): ImportFailureReason {
  const nom =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

  // Un PDF protégé n'est pas un PDF cassé : elle peut retirer le mot de
  // passe et réessayer. C'est la seule raison qui appelle une action
  // simple et sûre, donc elle mérite sa propre phrase.
  if (nom === "PasswordException") return "pdf_password";

  // Fichier corrompu, tronqué, ou pas un PDF malgré son extension.
  if (nom === "InvalidPDFException" || nom === "FormatError") return "pdf_damaged";

  return "extract_failed";
}
