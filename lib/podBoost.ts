// Tipote Boost — constantes + types partagés entre backend, frontend et
// extension Chrome. **Source de vérité unique** pour les valeurs énumé-
// rées (tons de commentaires, statuts de tâches, slug du pod FR seed).
//
// L'extension importera ces mêmes constantes via un build qui copie ce
// fichier au moment du package — pas de duplication.

/** Tons de commentaires proposés par l'IA. 4 valeurs, pas de sarcasme
 *  ni de blague (Béné, 19 mai 2026 : "pas de sarcasme ni de blague"). */
export const COMMENT_TONES = [
  "agree",
  "disagree",
  "add_value",
  "ask_question",
] as const;

export type CommentTone = (typeof COMMENT_TONES)[number];

/** Libellés affichés dans l'UI extension. Volontairement dans le fichier
 *  shared pour que l'extension les ait sans dépendre du namespace i18n
 *  côté webapp Tipote — l'extension doit pouvoir afficher quelque chose
 *  même offline. Les emojis sont volontairement neutres (vs Kawaak qui
 *  utilise 💣 pour "désaccord"). */
export const COMMENT_TONE_LABELS_FR: Record<CommentTone, { label: string; emoji: string }> = {
  agree: { label: "Je suis d'accord", emoji: "✅" },
  disagree: { label: "Je ne suis pas d'accord", emoji: "🤔" },
  add_value: { label: "Ajouter de la valeur", emoji: "💡" },
  ask_question: { label: "Poser une question", emoji: "❓" },
};

/** Statuts d'une tâche d'engagement. Toute transition d'état passe par
 *  une route API (jamais par un UPDATE direct depuis le client) — c'est
 *  ce qui permet d'incrémenter le karma de façon atomique. */
export const TASK_STATUSES = [
  "pending",
  "liked",
  "commented",
  "completed",
  "expired",
  "declined",
  "failed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Slug du pod FR seed inséré par la migration 20260523_pod_boost_foun-
 *  dation.sql. Référencé par l'auto-join à la connexion LinkedIn. */
export const SEED_POD_FR_SLUG = "fr-global";

/** Durée pendant laquelle un post reste "boostable" après publication.
 *  Au-delà, l'algo LinkedIn a déjà décidé du sort du post (les premières
 *  heures sont décisives). */
export const POST_ELIGIBILITY_HOURS = 6;
