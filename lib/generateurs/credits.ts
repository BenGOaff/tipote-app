// lib/generateurs/credits.ts
//
// CE QUE COÛTE UNE GÉNÉRATION, EN CRÉDITS IA.
//
// Béné, 1er septembre 2026 : "pour Tipote : dispo pour tout le monde qui
// paye, mais consomme des crédits. Calcule le nombre cohérent de crédits
// vis à vis de la consommation estimée de tokens pour chaque appel."
//
// -- CE FICHIER N'EXISTE QUE DANS TIPOTE ------------------------------
//
// Tiquiz n'a pas de crédits. Tout le reste de `lib/generateurs/` est
// identique à l'octet près dans les deux dépôts ; ceci est la SEULE
// divergence, et elle est assumée. Ne pas le porter là-bas : un module
// mort est un piège que le prochain passage rebranche en croyant
// réparer (leçon de `simuler()`, 31 août).
//
// ─────────────────────────────────────────────────────────────────────
// COMMENT CES CHIFFRES ONT ÉTÉ TROUVÉS
// ─────────────────────────────────────────────────────────────────────
//
// PAS en inventant une échelle : en RELEVANT celle qui existe déjà dans
// ce dépôt, puis en vérifiant qu'elle tient au regard des tokens.
//
// Ce que Tipote facture aujourd'hui, mesuré dans le code (les `max_tokens`
// sont des PLAFONDS de sortie, pas la consommation réelle) :
//
//   | ce qui est facturé            | crédits | plafond de sortie |
//   |-------------------------------|---------|-------------------|
//   | chat d'idée de quiz           |   0,5   |        800        |
//   | variantes genrées             |   0,5   |       1000        |
//   | affiner un contenu            |   0,5   |         -         |
//   | post / email / vidéo          |   1     |       4000        |
//   | analyse IA (insights, persona,|   1     |       2000        |
//   |   concurrence, sondage...)    |         |                   |
//   | article de blog               |   4     |       4000        |
//   | offre                         |   5     |       4000        |
//   | générer un quiz               |   6     |       8000        |
//   | importer un quiz              |   6     |       8000        |
//
// **CE BARÈME N'EST PAS LINÉAIRE EN TOKENS, et c'est délibéré :** un
// article et un post ont le même plafond et ne coûtent pas pareil. Ce
// qui est facturé, c'est la LONGUEUR RÉELLE du livrable, pas le plafond.
//
// -- LE CALAGE, EN COÛT RÉEL ------------------------------------------
//
// Sonnet : 3 $ le million de tokens en entrée, 15 $ en sortie, 0,30 $
// pour une lecture de cache. Trois points de référence indépendants,
// avec leur longueur RÉELLE et non leur plafond :
//
//   - un post (~400 tokens de sortie, ~2000 d'entrée) : ~0,012 $ -> 1 crédit
//   - un article (~3000 de sortie)                    : ~0,055 $ -> 4 crédits
//   - un quiz généré (~5000 de sortie)                : ~0,084 $ -> 6 crédits
//
// Les trois donnent la même chose : **1 crédit vaut environ 0,013 $**.
// C'est l'unité avec laquelle les coûts ci-dessous sont calculés.
//
// -- ET L'ARGUMENT QUI TRANCHE VRAIMENT -------------------------------
//
// Il est PRODUIT, pas comptable : **un email généré dans "Créer" coûte
// 1 crédit.** Un email de séquence post-quiz doit donc coûter 1 crédit.
// Le facturer plus cher enverrait la créatrice les écrire un par un dans
// l'autre écran, et le générateur ne servirait à rien ; le facturer
// moins cher ferait de "Créer" le mauvais chemin. Un même livrable, un
// même prix, quel que soit l'endroit où on le demande.
//
// C'est cet argument qui fixe le barème, et le calcul en tokens qui le
// CONFIRME. Dans l'autre sens, on aurait un tarif juste au centime et
// incohérent à l'usage.

import type { Bloc } from "@/lib/generateurs/blocs";
import type { GenerateurId } from "@/lib/generateurs/catalogue";
import type { Piece } from "@/lib/generateurs/blocs";

/**
 * L'étape des pistes : trois propositions courtes en JSON.
 *
 * ~700 tokens de sortie, ~2600 d'entrée dont le socle lu en cache :
 * ~0,0135 $, donc 1 crédit. Elle se relance ("Proposer trois autres
 * pistes"), donc chaque relance la refacture : l'écran l'ANNONCE.
 */
export const COUT_PISTES = 1;

/**
 * Le coût d'UN morceau, par type.
 *
 * `contenu` est le bonus entier, le seul livrable long du lot : ~4000
 * tokens de sortie, ~0,063 $, donc 4 crédits. C'est exactement le tarif
 * d'un article de blog, et c'est bien le même travail.
 *
 * `guide` et `remise` sont des documents courts (~1200 et ~900 tokens).
 * Le calcul donne 1,4 et 1,1 : on facture 1. **Le sens de l'arrondi est
 * délibéré :** sous-facturer coûte quelques centimes, sur-facturer fait
 * douter du compteur, et un compteur en qui on n'a pas confiance
 * empêche d'utiliser l'outil.
 *
 * `post` est deux fois plus court qu'un email (~250 tokens contre ~500)
 * et 0,5 existe déjà dans ce dépôt (le chat d'idée, les variantes
 * genrées) : le barème n'a pas besoin d'une nouvelle granularité.
 */
export const COUT_PAR_BLOC: Record<Bloc, number> = {
  contenu: 4,
  guide: 1,
  remise: 1,
  email: 1,
  post: 0.5,
};

/** Ce que coûte ce morceau là. */
export function coutMorceau(bloc: Bloc): number {
  return COUT_PAR_BLOC[bloc] ?? 1;
}

/**
 * Ce que coûte une piste ENTIÈRE, pistes comprises.
 *
 * C'est ce chiffre là qui s'affiche AVANT de lancer. Annoncer le coût
 * d'un morceau, c'est laisser découvrir le total en cours de route.
 */
export function coutTotalPiste(pieces: Piece[]): number {
  return pieces.reduce((somme, p) => somme + coutMorceau(p.bloc), 0);
}

/**
 * Ce que coûte un générateur, dans son cas le plus courant.
 *
 * Sert la page d'accueil, où aucune piste n'existe encore : elle ne
 * peut donc annoncer qu'un ORDRE DE GRANDEUR, et l'écran le dit avec
 * "environ". Un chiffre exact annoncé trop tôt serait un chiffre faux.
 *
 *   - bonus  : 1 + 4 + 1 + 1        = 7   (les trois blocs sont imposés)
 *   - emails : 1 + 5 emails         = 6   (une séquence type)
 *   - promo  : 1 + 3 emails + 4 posts = 6
 *
 * Les trois tournent autour de 6, c'est à dire le prix d'un quiz généré.
 * C'est le bon ordre de grandeur : on écrit tout ce qui vient APRÈS le
 * quiz, et ça ne doit pas coûter plus cher que le quiz lui même.
 */
export const COUT_INDICATIF: Record<GenerateurId, number> = {
  bonus: 7,
  emails: 6,
  promo: 6,
};
