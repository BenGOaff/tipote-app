// lib/quizDelete.ts
//
// Pourquoi une suppression de quiz peut échouer, et quoi en dire.
//
// DRAME BÉNÉ, 3 août 2026. Elle supprime un projet : rien. Elle
// recommence : rien. La seule trace était dans la console du navigateur,
// un `400` nu sur `/api/quiz/<id>`. Elle a fini par se demander si le
// quiz n'était pas supprimé côté serveur et affiché par erreur.
//
// Il ne l'était pas. Deux fautes empilées :
//
// 1. `popquiz_cues.quiz_id` référence `quizzes(id)` en ON DELETE
//    RESTRICT (20260504_popquiz_module.sql). Un quiz réutilisé comme question
//    dans une vidéo interactive ne PEUT pas être supprimé : Postgres
//    refuse, la transaction est annulée, le quiz reste. C'est voulu, le
//    commentaire de la migration le dit : "the editor will surface a
//    warning instead". Sauf que l'éditeur n'a jamais rien affiché.
//
// 2. Le client faisait `if (data.ok) { retirer de la liste }` et RIEN
//    dans le cas contraire : pas de toast, pas de message. Un `catch` ne
//    couvrait que la panne réseau. Un refus du serveur était donc, à
//    l'écran, strictement indiscernable d'un clic qui n'a pas pris.
//
// La règle qui en sort, et qui vaut au delà de la suppression : une
// réponse `ok: false` DOIT produire quelque chose à l'écran. Un échec
// silencieux coûte plus cher que le bug qu'il masque, parce que
// l'utilisatrice cherche au mauvais endroit.
//
// Ce module ne fait que traduire l'erreur Postgres en raison
// exploitable. Il est pur : la route l'utilise pour choisir son code
// HTTP, les tests l'utilisent pour figer le comportement.

/** Erreur telle que la rend supabase-js (PostgrestError, ou rien). */
export type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

export type DeleteRefusal =
  /** Rien ne s'oppose à la suppression. */
  | { kind: "ok" }
  /** Le quiz est réutilisé comme question dans une vidéo interactive. */
  | { kind: "used_by_popquiz" }
  /** Une autre contrainte le retient : on le dit sans prétendre savoir. */
  | { kind: "still_referenced" }
  /** Panne inattendue : on remonte le message brut pour le diagnostic. */
  | { kind: "failed"; detail: string };

/** Code SQLSTATE d'une violation de clé étrangère. */
const FK_VIOLATION = "23503";

/**
 * Ce que dit vraiment l'erreur renvoyée par la suppression.
 *
 * On reconnaît `popquiz_cues` par le NOM DE LA TABLE, présent dans le
 * message et dans les détails de Postgres, et pas par le nom de la
 * contrainte : celui-ci change si quelqu'un recrée la clé, le nom de la
 * table non.
 */
export function classifyDeleteError(err: DbErrorLike): DeleteRefusal {
  if (!err) return { kind: "ok" };

  const haystack = `${err.code ?? ""} ${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();

  if (err.code === FK_VIOLATION || haystack.includes("foreign key")) {
    if (haystack.includes("popquiz")) return { kind: "used_by_popquiz" };
    return { kind: "still_referenced" };
  }

  return { kind: "failed", detail: (err.message ?? "").trim() || "unknown" };
}

/** Code HTTP correspondant. 409 = "l'état actuel s'y oppose", pas 400. */
export function deleteRefusalStatus(refusal: DeleteRefusal): number {
  switch (refusal.kind) {
    case "ok":
      return 200;
    case "used_by_popquiz":
    case "still_referenced":
      // 409 Conflict : la demande est valide, c'est l'état des données qui
      // la refuse. Un 400 laissait croire à une requête malformée, donc à
      // un bug de notre côté, et n'orientait vers rien.
      return 409;
    case "failed":
      return 500;
  }
}

/**
 * Clé i18n à afficher. Le serveur renvoie la RAISON, jamais la phrase :
 * l'interface existe en 7 langues et c'est le client qui sait laquelle
 * l'utilisatrice lit.
 */
export function deleteRefusalReason(refusal: DeleteRefusal): string {
  switch (refusal.kind) {
    case "ok":
      return "ok";
    case "used_by_popquiz":
      return "used_by_popquiz";
    case "still_referenced":
      return "still_referenced";
    case "failed":
      return "failed";
  }
}
