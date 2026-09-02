// lib/nav/surfacePublique.ts
//
// LE CHROME DE L'APP NE S'AFFICHE JAMAIS CHEZ UN VISITEUR.
//
// Béné, 1er septembre 2026 : "le didacticiel s'ouvre sur la version en
// ligne du quiz putain !! Le didacticiel ne concerne PAS les visiteurs
// de quiz !!"
//
// Béné, 2 septembre 2026 : "le didacticiel Tipote s'affiche sur le
// centre d'aide PUTAIN !! Hier il s'affichait sur les quiz publics,
// aujourd'hui sur le centre d'aide."
//
// -- ELLE A RAISON DEUX FOIS, ET C'EST LE MÊME DÉFAUT ------------------
//
// La première correction a remplacé DEUX listes d'exceptions par UNE.
// C'était mieux, et c'était encore la mauvaise forme : cette liste
// nommait les surfaces PUBLIQUES, donc tout écran public ajouté après
// elle fuitait, exactement comme avant. `/support` n'y était pas.
//
// Et il ne pouvait pas y être : le centre d'aide est PUBLIC depuis le
// 23 août (celle qui a le plus besoin d'aide est celle qui n'arrive pas
// à se connecter), donc il est arrivé APRÈS la liste. Une liste
// d'exceptions oublie toujours le prochain écran : c'est écrit dans ce
// fichier depuis hier, et j'ai quand même refait une liste d'exceptions.
//
// -- LA CORRECTION : ON INVERSE, ET C'EST STRUCTUREL -------------------
//
// **Le chrome ne s'affiche QUE là où on l'a dit.** Tout le reste est
// public par défaut. Un écran public ajouté demain n'a plus rien à
// déclarer : il ne verra jamais le didacticiel.
//
// Le sens de l'erreur devient sûr, et c'est ce qui tranche :
//
//   un écran d'app oublié dans la liste   -> le didacticiel ne s'affiche
//                                            pas pour la créatrice. Elle
//                                            le dit, on l'ajoute.
//   un écran public oublié (l'ancien sens) -> l'écran gris du didacticiel
//                                            s'ouvre chez la cliente d'une
//                                            cliente. On l'apprend en se
//                                            faisant engueuler.
//
// -- ET LE PATHNAME NE SUFFIT PAS --------------------------------------
//
// Sur le domaine perso d'une créatrice, le middleware RÉÉCRIT l'adresse
// vers `/s/<slug>`. Le `usePathname()` du navigateur, lui, rend le
// chemin que le VISITEUR a tapé (`/mon-quiz`). Un gate qui ne regarde
// que le pathname est donc MORT sur ces domaines, exactement comme il
// l'était sur `affiliate.tipote.com`.
//
// D'où le HOST : nos écrans d'app ne sont servis QUE sur nos domaines.

/**
 * LES ÉCRANS DE L'APP, ceux où la créatrice travaille.
 *
 * C'est la SEULE liste, et elle est fermée. Relevée dans `app/` le
 * 2 septembre 2026, route par route, pas de mémoire.
 *
 * Ce qui n'y est PAS, et qui n'y sera jamais : les viewers publics
 * (`/q`, `/s`, `/pq`, `/p`), le centre d'aide (`/support`), les pages
 * légales, la connexion, l'inscription, le formulaire de résiliation,
 * la page de partage d'un quiz, l'espace affilié (déjà exclu à part par
 * le host) et la racine.
 */
export const PREFIXES_APP: readonly string[] = [
  "/admin",
  "/analytics",
  "/app",
  "/automations",
  "/boost",
  "/clients",
  "/connect",
  "/contents",
  "/create",
  "/dashboard",
  "/generateurs",
  "/leads",
  "/pages",
  "/pepites",
  "/popquiz",
  "/popquizzes",
  "/quiz",
  "/settings",
  "/strategy",
  "/survey",
  "/tasks",
  "/templates",
  "/webinars",
  "/widgets",
];

/**
 * Ce host est-il un des NÔTRES ?
 *
 * On raisonne par domaine et pas par liste exacte : une adresse de plus
 * (une préproduction, un sous-domaine) reste reconnue sans qu'on ait à
 * la nommer ici.
 */
export function estNotreHote(hostname: string | null | undefined): boolean {
  const h = String(hostname ?? "").trim().toLowerCase().split(":")[0];
  if (!h) return true; // inconnu : on ne conclut RIEN à partir de rien.
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local")) return true;
  return h === "tipote.com" || h.endsWith(".tipote.com");
}

/** Le chemin est-il un écran de l'app ? Comparaison par SEGMENT. */
export function cheminDeLApp(pathname: string | null | undefined): boolean {
  const p = String(pathname ?? "");
  // `p === prefixe || p.startsWith(prefixe + "/")` et jamais un
  // `startsWith` nu : sinon `/quizzes-publics` serait pris pour `/quiz`.
  return PREFIXES_APP.some((prefixe) => p === prefixe || p.startsWith(prefixe + "/"));
}

/**
 * Sommes-nous sur une surface vue par un VISITEUR ?
 *
 * PURE, donc testée. `hostname` peut manquer (rendu serveur) : on se
 * rabat alors sur le chemin.
 */
export function estSurfacePublique(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  // Un domaine qui n'est pas le nôtre ne sert que du contenu public :
  // le portier du middleware répond 404 à tout le reste.
  if (hostname != null && !estNotreHote(hostname)) return true;
  return !cheminDeLApp(pathname);
}

/**
 * Gardé pour les appelants qui listaient les surfaces publiques.
 *
 * @deprecated La décision se prend sur `PREFIXES_APP`. Cette liste ne
 * sert plus qu'à documenter les chemins publics les plus fréquentés, et
 * elle n'est utilisée par aucune décision : en ajouter un n'est plus
 * nécessaire, et en oublier un ne coûte plus rien.
 */
export const PREFIXES_PUBLICS_CONNUS: readonly string[] = [
  "/q/",
  "/s/",
  "/pq/",
  "/p/",
  "/support",
  "/legal",
  "/depart/",
  "/partage/",
  "/help",
  "/auth",
  "/onboarding",
];
