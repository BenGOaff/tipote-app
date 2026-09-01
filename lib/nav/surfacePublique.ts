// lib/nav/surfacePublique.ts
//
// LE CHROME DE L'APP NE S'AFFICHE JAMAIS CHEZ UN VISITEUR
// (retour Béné, 1er septembre 2026).
//
// "Le didacticiel s'ouvre sur la version en ligne du quiz putain !! Le
// didacticiel ne concerne PAS les visiteurs de quiz !!"
//
// Elle a raison, et la cause est celle qui revient : DEUX LISTES
// D'EXCEPTIONS, tenues séparément, qui ne disaient pas la même chose.
//
//   CoachWidget    : ["/auth","/onboarding",...,"/q/","/p/","/support",...]
//   TutorialOverlay: ["/", "/login", "/auth", "/onboarding"]  <- pas "/q/"
//
// Le bouton de chat se cachait donc bien sur le quiz public, et l'écran
// gris du didacticiel s'ouvrait par dessus le quiz d'une cliente, chez
// ses visiteurs. Une liste oublie toujours le prochain écran ajouté :
// c'est déjà ce qui avait coûté la fuite sur l'espace affilié (drame
// Gwenn, 8 juin 2026), et c'est le même défaut, un cran plus loin.
//
// -- ET LE PATHNAME NE SUFFIT PAS ---------------------------------------
//
// Sur le domaine perso d'une créatrice, le middleware RÉÉCRIT l'adresse
// vers `/s/<slug>`. Le `usePathname()` du navigateur, lui, rend le
// chemin que le VISITEUR a tapé (`/mon-quiz`), pas la réécriture. Un
// gate qui ne regarde que le pathname est donc MORT sur ces domaines,
// exactement comme il l'était sur `affiliate.tipote.com`.
//
// D'où le HOST, et c'est lui la vraie garantie : nos écrans d'app ne
// sont servis QUE sur nos domaines. Tout ce qui vit ailleurs est du
// contenu public, par construction (le portier du middleware répond 404
// à tout le reste sur un domaine perso).

/** Les chemins qui servent du contenu PUBLIC sur nos propres domaines. */
export const PREFIXES_PUBLICS: readonly string[] = [
  "/q/", // le viewer de quiz et de sondage
  "/s/", // le même, servi sur le domaine perso d'une créatrice
  "/pq/", // le viewer de popquiz
  "/p/", // la page publique d'un popquiz
  "/depart/", // le formulaire de résiliation, ouvert sans session
];

/**
 * Ce host est-il un des NÔTRES ?
 *
 * On raisonne par domaine et pas par liste exacte : une adresse de plus
 * (une préproduction, un sous-domaine) reste reconnue sans qu'on ait à
 * la nommer ici. Le coût d'une erreur est asymétrique et c'est ce qui
 * décide : un host à nous pris pour un domaine perso masque un
 * didacticiel, un domaine perso pris pour le nôtre affiche un écran
 * d'admin chez les visiteurs d'une cliente.
 */
export function estNotreHote(hostname: string | null | undefined): boolean {
  const h = String(hostname ?? "").trim().toLowerCase().split(":")[0];
  if (!h) return true; // inconnu : on ne conclut RIEN à partir de rien.
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local")) return true;
  return h === "tipote.com" || h.endsWith(".tipote.com");
}

/**
 * Sommes-nous sur une surface vue par un VISITEUR ?
 *
 * PURE, donc testée. `hostname` peut manquer (rendu serveur) : on se
 * rabat alors sur le chemin, qui couvre nos propres domaines.
 */
export function estSurfacePublique(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  if (hostname != null && !estNotreHote(hostname)) return true;
  const p = String(pathname ?? "");
  return PREFIXES_PUBLICS.some((prefixe) => p.startsWith(prefixe));
}
