// lib/affiliate/nomPublic.ts
//
// LE PRÉNOM QU'UNE AFFILIÉE MONTRE À SES PROSPECTS (Béné, 27 août 2026).
//
// "Par exemple si lien affilié : Jocelyne te propose de tester Tiquiz
// gratuitement alors n'hésite pas."
//
// Ce prénom finit sur une page PUBLIQUE, lue par quelqu'un qui ne
// connaît ni nous ni l'affiliée. Trois conséquences, et les trois sont
// dans le code plutôt que dans une consigne :
//
//   1. LE PRÉNOM SEUL. `display_name` peut porter un nom complet, et
//      personne n'a demandé à ce que son nom de famille s'affiche
//      devant des inconnus. On prend le premier mot, point.
//   2. UNE ADRESSE EMAIL N'EST JAMAIS UN PRÉNOM. Beaucoup de gens
//      remplissent un champ "nom" avec leur adresse. L'afficher serait
//      publier son email sur une page ouverte.
//   3. ON REND `null` PLUTÔT QU'UNE APPROXIMATION. Sans prénom fiable,
//      l'écran dit "un partenaire Tiquiz" : c'est vrai, ça ne trahit
//      personne, et ça garde le reste du message. Fabriquer un prénom à
//      partir du CODE (`?ref=jd2024`) donnerait "Jd2024", ce qui est
//      pire que rien.
//
// Fonction PURE et JUMELLE des deux côtés : Tipote s'en sert pour ne
// renvoyer QUE le prénom (ce qu'on n'envoie pas ne peut pas fuiter),
// Tiquiz la rappelle avant l'affichage. Une règle qui ne vit que d'un
// côté ne protège personne (leçon des deux versions divergentes de
// pdf-parse, 7 août).

/** Longueurs acceptées. En dessous ce n'est pas un prénom, au dessus
 *  c'est une phrase qui casserait la mise en page. */
const MIN = 2;
const MAX = 24;

/** Lettres, accents combinés, trait d'union et apostrophes. Ni chiffre,
 *  ni parenthèse, ni ponctuation technique. */
const NOM_RE = /^\p{L}[\p{L}\p{M}'\u2019-]*$/u;

export function prenomPublic(displayName: string | null | undefined): string | null {
  let brut = String(displayName ?? "");
  // Ce champ est saisi par une affiliée et rendu dans une page : on
  // retire tout ce qui ressemble à une balise AVANT de découper, sinon
  // un `<b>Jocelyne` donnerait un premier mot inutilisable.
  brut = brut.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!brut) return null;
  // Une adresse email n'est pas un prénom, même partielle.
  if (brut.includes("@")) return null;

  const premier = brut.split(" ")[0] ?? "";
  // Une initiale seule ("J. Dupont") ne dit rien : on ne garde pas.
  const mot = premier.replace(/[.,;:]+$/, "");
  if (mot.length < MIN || mot.length > MAX) return null;
  // UN PRÉNOM EST FAIT DE LETTRES, et de rien d'autre (le trait d'union
  // et l'apostrophe des prénoms composés mis à part). Se contenter de
  // "il contient au moins une lettre" laissait passer `alert(1)` et
  // `Jd2024` : ce n'est pas dangereux (React échappe le texte), c'est
  // juste illisible au milieu d'une phrase, et la page dirait "Jd2024 te
  // propose de tester Tiquiz". Sans prénom plausible, on préfère "un
  // partenaire Tiquiz".
  if (!NOM_RE.test(mot)) return null;

  // TOUT EN MAJUSCULES = ELLE A TAPÉ VITE, PAS ELLE A CRIÉ. On adoucit,
  // sinon la phrase hurle au milieu d'une page calme. Un prénom déjà
  // écrit normalement n'est PAS retouché : "Jean-Luc" et "d'Arcy"
  // doivent survivre, et une règle de capitalisation appliquée à tout
  // les abîmerait.
  if (mot === mot.toLocaleUpperCase("fr-FR") && mot !== mot.toLocaleLowerCase("fr-FR")) {
    return mot.charAt(0) + mot.slice(1).toLocaleLowerCase("fr-FR");
  }
  // Une saisie tout en minuscules mérite sa majuscule.
  if (mot === mot.toLocaleLowerCase("fr-FR")) {
    return mot.charAt(0).toLocaleUpperCase("fr-FR") + mot.slice(1);
  }
  return mot;
}
