// lib/quiz/captureCompliance.ts
//
// LA CASE DE CONSENTEMENT QUI NE RENVOIE À RIEN (Damien, 27 août 2026).
//
// En relisant son quiz : il collecte des adresses email, la case de
// consentement est affichée, `consent_text` est VIDE et `privacy_url`
// est NUL. Le visiteur lit donc notre phrase par défaut,
// "J'accepte la politique de confidentialité.", sans le moindre lien,
// pour une politique qui n'existe nulle part. Il coche une case qui ne
// renvoie à rien, juste avant de laisser son adresse.
//
// Le viewer ne pouvait pas mieux faire : `ConsentText` rend le texte par
// défaut quand le champ est vide, et n'ajoute un lien que s'il a une
// adresse à mettre dedans. Refuser d'afficher la case serait pire (il
// collecterait alors sans rien demander du tout).
//
// C'est donc à l'ÉDITEUR de le dire, et c'est la règle du `ok: false` du
// 3 août transposée : un manque qui a des conséquences doit produire
// quelque chose à l'écran. Une créatrice ne peut pas deviner qu'il lui
// manque une pièce dont le visiteur voit le nom.
//
// -- CE MODULE EST PUR, ET C'EST LA MOITIÉ DU TRAVAIL -----------------
//
// La décision vit ici et pas dans le JSX, pour la raison écrite dans
// AGENTS.md : une logique enfermée dans un composant React n'est pas
// testable, donc elle n'est pas testée, donc c'est exactement là que les
// bugs s'installent. Et elle doit rendre le MÊME verdict que le viewer :
// si les deux calculent chacun de leur côté, l'éditeur finit par mentir
// (les réseaux de partage, le score, l'alignement du sous-titre, la
// disposition des réponses : quatre fois déjà).

export type CaptureCompliance = {
  /**
   * La case est affichée, elle parle d'une politique de confidentialité,
   * et le visiteur n'a AUCUN moyen de la lire.
   */
  consentSansPolitique: boolean;
};

/** Un lien écrit à la main dans le texte de consentement. */
const PORTE_UN_LIEN = /<a\s[^>]*href\s*=\s*["']?[^"'\s>]+/i;

/**
 * Ce que le visiteur pourra vraiment lire au moment de laisser son
 * adresse.
 *
 * Les quatre entrées sont OBLIGATOIRES, comme le `mode` des contrôles de
 * cohérence : une seule devinée à l'intérieur, et le verdict cesse de
 * décrire l'écran réel au premier réglage qui bouge.
 */
export function readCaptureCompliance(args: {
  /** `quizzes.capture_enabled` : on demande une adresse. */
  captureEnabled: boolean;
  /** `quizzes.show_consent_checkbox` : la case est affichée. */
  showConsentCheckbox: boolean;
  /** `quizzes.consent_text` : vide = notre phrase par défaut. */
  consentText: string | null | undefined;
  /** `quizzes.privacy_url` : l'adresse de sa politique. */
  privacyUrl: string | null | undefined;
}): CaptureCompliance {
  const { captureEnabled, showConsentCheckbox, consentText, privacyUrl } = args;

  // Rien n'est demandé au visiteur : il n'y a rien à promettre.
  if (!captureEnabled) return { consentSansPolitique: false };
  // Pas de case affichée : c'est un autre sujet, et pas celui-ci.
  if (!showConsentCheckbox) return { consentSansPolitique: false };
  // Une adresse renseignée : le viewer la posera en lien.
  if (String(privacyUrl ?? "").trim().length > 0) return { consentSansPolitique: false };
  // Elle a écrit son propre lien dans le texte : le viewer le respecte
  // et n'en ajoute pas un deuxième.
  if (PORTE_UN_LIEN.test(String(consentText ?? ""))) return { consentSansPolitique: false };

  return { consentSansPolitique: true };
}
