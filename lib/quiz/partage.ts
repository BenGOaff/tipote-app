// lib/quiz/partage.ts
//
// PARTAGER UN QUIZ ENTIER, COMME ON PARTAGE UN TUNNEL.
//
// Béné, 25 août 2026 : "je bosse un exemple de quiz pour un potentiel
// gros client. Je voudrais pouvoir lui envoyer son quiz en mode 'un clic
// et le quiz est installé chez moi' avec les textes, les images, les
// points etc... il devra juste personnaliser et charger ses tags."
//
// -- LA RÈGLE, EN UNE LIGNE --------------------------------------------
//
// **LES TEXTES VOYAGENT, LES DESTINATIONS ET LES IDENTIFIANTS RESTENT.**
//
// Tout ce qui est du CONTENU (titres, questions, réponses, points,
// profils, images, couleurs, mise en page) part dans la copie : c'est
// exactement le travail qu'on lui offre. Tout ce qui DÉSIGNE le
// propriétaire d'origine reste chez lui :
//
//   - les tags et les clés Systeme.io : ils déclencheraient SES
//     automatisations sur les leads de quelqu'un d'autre ;
//   - les pixels et identifiants publicitaires : le quiz de son client
//     enverrait des conversions dans SON compte Meta ou Google Ads ;
//   - les URL de bouton, de redirection, de politique de
//     confidentialité, de pied de page : elles enverraient les visiteurs
//     du client sur le site de Béné, et un lien légal qui pointe chez
//     quelqu'un d'autre n'est pas seulement gênant, il est faux.
//
// Ce n'est pas de la prudence d'ingénieur : chacun de ces champs, copié
// tel quel, produit un bug INVISIBLE à l'installation et découvert des
// semaines plus tard, sur les données de vrais visiteurs.
//
// -- CE QUI RESTE À FAIRE APRÈS L'INSTALLATION -------------------------
//
// Ce qu'on retire, on le DIT. `aPersonnaliser()` rend la liste, et
// l'écran la montre : un champ vidé sans un mot, c'est quelqu'un qui
// publie un quiz dont le bouton ne mène nulle part.

import { randomUUID } from "node:crypto";

/**
 * Le jeton d'un lien de partage.
 *
 * 32 caractères hexadécimaux tirés au hasard : ce lien donne le droit
 * d'INSTALLER un quiz, donc il ne doit pas se deviner. Pas de mot
 * lisible, pas de dérivation depuis l'identifiant du quiz.
 */
export function genererJetonPartage(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, "").slice(0, 32);
}

/** Un jeton reçu est-il de la bonne forme ? On n'interroge pas la base
 *  avec n'importe quoi. */
export function jetonValide(brut: unknown): string | null {
  const v = String(brut ?? "").trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(v) ? v : null;
}

// ── CE QUI NE TRAVERSE PAS ───────────────────────────────────────────

/**
 * Les colonnes de `quizzes` qui ne partent JAMAIS dans une copie
 * installée par quelqu'un d'autre.
 *
 * C'est un SUR-ENSEMBLE de ce que la duplication interne retire déjà
 * (identité, compteurs, statut). Ici s'ajoute tout ce qui désigne le
 * propriétaire d'origine ou une destination qui lui appartient.
 */
export const QUIZ_COLONNES_PRIVEES = new Set([
  // Identité, compteurs, statut : régénérés ou remis à zéro.
  "id",
  "created_at",
  "updated_at",
  "embed_session_id",
  "views_count",
  "starts_count",
  "completions_count",
  "shares_count",
  "status",
  "slug",
  "user_id",
  "project_id",
  "ai_insights",
  "ai_insights_at",
  // Systeme.io : ses tags déclencheraient SES automatisations sur les
  // leads de quelqu'un d'autre, et sa clé d'API n'a rien à faire
  // ailleurs.
  "sio_api_key_id",
  "sio_capture_tag",
  "sio_share_tag_name",
  "sio_score_tags",
  // Publicité et mesure : le quiz du client enverrait ses conversions
  // dans le compte Meta ou Google de la personne qui a partagé.
  "meta_pixel_id",
  "ga4_measurement_id",
  "google_ads_conversion_id",
  "google_ads_conversion_label",
  // Destinations : elles envoient les visiteurs ailleurs que chez le
  // nouveau propriétaire.
  "cta_url",
  "privacy_url",
  "custom_footer_url",
  "custom_footer_text",
  "close_redirect_url",
  "close_cta_url",
  // Réglages liés au plan de l'expéditeur : le nouveau propriétaire a
  // les siens, et hériter d'un "sans marque" qu'il n'a pas payé lui
  // ferait perdre l'option à la première sauvegarde.
  "hide_branding",
]);

/** Les colonnes d'un profil de résultat qui ne traversent pas. */
export const RESULT_COLONNES_PRIVEES = new Set([
  "id",
  "quiz_id",
  "created_at",
  "updated_at",
  // La destination du bouton, et les intégrations du profil.
  "cta_url",
  "sio_tag_name",
  "sio_tag_names",
  "sio_course_id",
  "sio_community_id",
]);

/** Les colonnes d'une question qui ne traversent pas. */
export const QUESTION_COLONNES_PRIVEES = new Set([
  "id",
  "quiz_id",
  "created_at",
  "updated_at",
]);

/** Retire d'une ligne tout ce qui ne doit pas voyager. */
export function nettoyerPourPartage(
  ligne: Record<string, unknown>,
  privees: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ligne)) {
    if (!privees.has(k)) out[k] = v;
  }
  return out;
}

// ── CE QU'ON DIT APRÈS ───────────────────────────────────────────────

export type AFaire =
  | "tags-systeme-io"
  | "url-bouton"
  | "politique-confidentialite"
  | "tracking"
  | "pied-de-page";

/**
 * Ce que le nouveau propriétaire doit régler avant de publier.
 *
 * On ne rend QUE ce qui existait chez l'expéditeur : annoncer "pense à
 * tes tags Systeme.io" à quelqu'un dont le quiz n'en avait aucun est du
 * bruit, et une liste qui contient du bruit ne se lit plus.
 */
export function aPersonnaliser(source: {
  quiz: Record<string, unknown>;
  resultats: Record<string, unknown>[];
}): AFaire[] {
  const q = source.quiz;
  const rempli = (v: unknown) => String(v ?? "").trim().length > 0;
  const liste: AFaire[] = [];

  const avaitDesTags =
    rempli(q.sio_capture_tag) ||
    rempli(q.sio_share_tag_name) ||
    source.resultats.some(
      (r) =>
        rempli(r.sio_tag_name) ||
        (Array.isArray(r.sio_tag_names) && r.sio_tag_names.length > 0) ||
        rempli(r.sio_course_id) ||
        rempli(r.sio_community_id),
    );
  if (avaitDesTags) liste.push("tags-systeme-io");

  if (rempli(q.cta_url) || source.resultats.some((r) => rempli(r.cta_url))) {
    liste.push("url-bouton");
  }
  if (rempli(q.privacy_url)) liste.push("politique-confidentialite");
  if (
    rempli(q.meta_pixel_id) ||
    rempli(q.ga4_measurement_id) ||
    rempli(q.google_ads_conversion_id)
  ) {
    liste.push("tracking");
  }
  if (rempli(q.custom_footer_text) || rempli(q.custom_footer_url)) {
    liste.push("pied-de-page");
  }
  return liste;
}

// ── L'ÉTAT D'UN LIEN ─────────────────────────────────────────────────

/** Ce que `etatPartage` LIT, et rien de plus. Le jeton et le quiz n'y
 *  figurent pas : cette décision ne les regarde pas, et les exiger
 *  obligerait chaque appelant à les charger pour rien. */
export type LignePartage = {
  enabled?: boolean | null;
  expires_at?: string | null;
  max_installs?: number | null;
  installs_count?: number | null;
};

export type EtatPartage =
  | { ouvert: true }
  | { ouvert: false; raison: "inconnu" | "revoque" | "expire" | "epuise" };

/**
 * Ce lien peut-il encore installer le quiz ?
 *
 * `maintenant` est un PARAMÈTRE : un test qui dépend de l'horloge
 * clignote, et un test qui clignote est pire que pas de test.
 */
export function etatPartage(
  ligne: LignePartage | null | undefined,
  maintenant: Date,
): EtatPartage {
  if (!ligne) return { ouvert: false, raison: "inconnu" };
  if (ligne.enabled === false) return { ouvert: false, raison: "revoque" };
  if (ligne.expires_at) {
    const fin = new Date(ligne.expires_at);
    // Une date illisible ferme le lien : un doute sur un droit d'accès
    // se tranche en faveur du refus.
    if (Number.isNaN(fin.getTime()) || fin.getTime() <= maintenant.getTime()) {
      return { ouvert: false, raison: "expire" };
    }
  }
  const max = Number(ligne.max_installs ?? 0);
  if (Number.isInteger(max) && max > 0 && Number(ligne.installs_count ?? 0) >= max) {
    return { ouvert: false, raison: "epuise" };
  }
  return { ouvert: true };
}
