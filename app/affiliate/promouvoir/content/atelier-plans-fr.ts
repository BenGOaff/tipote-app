// app/affiliate/promouvoir/content/atelier-plans-fr.ts
//
// Les parcours d'envoi conseillés par Béné dans le kit affilié. Un affilié
// qui n'a pas 15 jours devant lui doit savoir lesquels garder, et dans
// quel ordre : sans ça, il envoie les trois premiers et s'arrête.

/** Version courte de la campagne email : 7 envois, dans cet ordre. */
export const ATELIER_EMAIL_PLAN_7 = [1, 3, 4, 5, 12, 13, 15];

/** Version minimale qui reste honnête : 3 envois à trois jours d'intervalle. */
export const ATELIER_EMAIL_PLAN_3 = [1, 4, 15];

/** Calendrier court des posts : 5 publications, une par semaine. */
export const ATELIER_POST_PLAN_5 = [1, 4, 3, 12, 15];
