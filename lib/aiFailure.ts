// lib/aiFailure.ts
//
// POURQUOI UNE GÉNÉRATION N'A PAS ABOUTI.
//
// -- CE QUI A DÉCLENCHÉ CE FICHIER ------------------------------------
//
// L'Atelier, 5 août 2026, retour de Béné mot pour mot :
//
//   "la génération du contenu a échoué : api/me/bonus:1 Failed to load
//    resource: the server responded with a status of 502"
//
// Un 502 nu, et rien pour savoir laquelle des quatre causes possibles
// s'est produite : Anthropic saturé, Anthropic qui refuse la requête, la
// génération trop longue coupée par notre propre minuteur, ou le réseau.
// Les quatre appellent des gestes DIFFÉRENTS (attendre une minute,
// relancer, vérifier sa connexion, nous signaler le problème) et l'écran
// disait la même phrase pour les quatre.
//
// C'est le `ok: false` muet du 3 août dans une autre robe : il produisait
// bien quelque chose à l'écran, mais qui ne distinguait rien.
//
// -- CE FICHIER EXISTAIT DANS L'ATELIER, ET PAS ICI --------------------
//
// L'`AGENTS.md` de ce dépôt affirmait pourtant que `aiFailure.ts`
// "traduit déjà le statut côté client" (note du 31 août). C'était faux :
// il ne vivait que dans formaquiz. Un garde-fou qui ne protège qu'un des
// jumeaux ne protège personne, et une doc qui le décrit comme actif est
// pire qu'une doc muette.
//
// -- ET IL NE REND AUCUNE PHRASE, CONTRAIREMENT À CELUI DE L'ATELIER ---
//
// L'Atelier est MONOLINGUE, donc sa version porte les phrases. Ici
// l'interface existe en 7 langues : le serveur renvoie la RAISON,
// l'écran dit comment la dire (règle du 3 août, suppression d'un quiz,
// puis du 7 août, import PDF). Recopier `failureCopy` mettrait du
// français dans le code, ce qui est exactement la faute trouvée le
// 1er septembre dans les replis "Résultat 4".
//
// -- IL NE DÉCIDE PAS NON PLUS CE QUI SE RÉESSAIE ----------------------
//
// Ça, c'est `lib/aiRetry.ts`. Réécrire la liste des statuts transitoires
// ici serait la même règle à deux endroits, donc deux règles le jour où
// l'une bouge.

import { isRetryableStatus } from "@/lib/aiRetry";

/** Ce qui a empêché la génération, du point de vue de la créatrice. */
export type AiFailure =
  /** En face, c'est saturé. Ça repart tout seul : on peut réessayer. */
  | "busy"
  /** Notre minuteur a coupé avant la fin. Relancer, ou demander moins. */
  | "too_long"
  /** La requête a été refusée : c'est chez nous qu'il faut chercher. */
  | "refused"
  /** On n'a même pas joint le service. */
  | "unreachable"
  /** Réponse reçue, mais vide. */
  | "empty";

/**
 * Le statut renvoyé par Anthropic, traduit en raison.
 *
 * 429 (trop de requêtes), 529 (surcharge) et les 5xx sont TRANSITOIRES :
 * la même requête passera dans une minute. Les autres 4xx viennent de ce
 * qu'on a envoyé, donc réessayer ne sert à rien et il faut le dire,
 * sinon la créatrice relance dix fois pour rien.
 */
export function classifyUpstream(status: number): AiFailure {
  return isRetryableStatus(status) ? "busy" : "refused";
}

/**
 * L'exception levée par `fetch`, traduite en raison.
 *
 * `AbortSignal.timeout` lève une `TimeoutError` ; un `AbortController`
 * lève une `AbortError`. Les deux veulent dire "c'était trop long", et
 * c'est la distinction qui manquait : sans elle, une coupure de notre
 * propre minuteur ressemblait à une panne d'Anthropic.
 */
export function classifyThrown(err: unknown): AiFailure {
  const name =
    typeof err === "object" && err !== null && "name" in err ? String((err as Error).name) : "";
  if (name === "TimeoutError" || name === "AbortError") return "too_long";
  return "unreachable";
}

/** Relancer tout seul n'a de sens que sur une saturation. */
export function isRetryable(failure: AiFailure): boolean {
  return failure === "busy";
}

/**
 * Le statut HTTP que NOTRE route renvoie pour cette raison.
 *
 * -- POURQUOI DES 2xx ET PAS DES 5xx (31 août 2026) --------------------
 *
 * Cloudflare sert nos six domaines et REMPLACE le corps d'un 5xx par sa
 * propre page. Un écran qui lit `reason` dans le JSON reçoit alors
 * `undefined` et retombe sur sa phrase générique : on aurait écrit tout
 * ce module pour rien. Mesuré deux fois le même jour, sur `signup` et
 * sur `newsletter`.
 *
 * Un 5xx ne se justifie que là où un FOURNISSEUR doit réessayer, c'est à
 * dire dans un webhook. Un navigateur ne réessaie rien tout seul : le
 * statut ne lui sert à rien, le corps lui sert à tout.
 *
 * La raison voyage donc dans le CORPS, avec `ok: false`, et la fonction
 * reste là pour les appelants hors navigateur.
 */
export function statusFor(failure: AiFailure): number {
  if (failure === "busy") return 503;
  if (failure === "too_long") return 504;
  return 502;
}
