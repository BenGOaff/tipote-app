// lib/generateurs/contenusStore.ts
//
// LA BASE, ET AUCUNE DÉCISION.
//
// Ce module importe `supabaseAdmin`, qui exige ses variables au
// chargement : aucun test ne peut l'importer. Tout ce qui se décide vit
// donc dans `bibliotheque.ts`, à côté, en fonctions pures. C'est la
// leçon du verrou des webhooks (24 août) : le bug s'était installé
// exactement dans le fichier qu'aucun test ne pouvait charger.
//
// -- LE REPLI, ET POURQUOI IL EST OBLIGATOIRE -------------------------
//
// La table est créée par `20260902_generateurs_contenus.sql`. Tant
// qu'elle n'est pas passée, PostgREST refuse la requête entière. Sans
// repli, un déploiement en avance sur la migration ferait PLANTER la
// génération elle même, c'est à dire casser ce qui marchait pour ajouter
// une bibliothèque (drame `quiz_events.meta`, 15 jours de statistiques
// perdues).
//
// Donc : enregistrer est BEST-EFFORT et ne lève jamais. Lire rend une
// liste vide ET dit que ça a échoué, parce que "je n'ai pas pu regarder"
// et "il n'y a rien" sont deux réponses différentes (règle du 23 août) :
// un écran vide se lit "je n'ai rien créé", et c'est faux.
//
// -- ET LE MÊME REPLI SUR LES TROIS COLONNES DE LA REPRISE -----------
//
// `20260903_generateurs_reprise.sql` ajoute `brief`, `pistes` et
// `piste`. PostgREST rejette l'écriture ENTIÈRE sur une colonne qu'il ne
// connaît pas : sans repli, un déploiement en avance sur la migration
// ferait perdre TOUS les contenus générés, en silence, alors que la
// bibliothèque marchait la veille. On réessaie donc sans elles, et on
// CRIE : la reprise attend la migration, le contenu non.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  lireContenu,
  type ContenuGenere,
  type MorceauEnregistre,
} from "@/lib/generateurs/bibliotheque";
import type { GenerateurId } from "@/lib/generateurs/catalogue";
import { assainirProjet, type ProjetEnregistre } from "@/lib/generateurs/projet";

const TABLE = "generateur_contenus";

export interface CleLivraison {
  userId: string;
  projectId: string | null;
  generateur: GenerateurId;
  quizId: string | null;
  quizTitre: string;
  titre: string;
  profilIndex: number | null;
  profilTitre: string;
  /**
   * DE QUOI REPRENDRE LE TRAVAIL : le brief, les pistes proposées, et
   * celle qui a été choisie. Il est RÉÉCRIT à chaque morceau, et c'est
   * voulu : c'est le dernier état de l'écran, donc celui qu'on veut
   * retrouver en rouvrant.
   */
  projet: ProjetEnregistre;
}

/**
 * Range un morceau dans sa livraison, en la créant au besoin.
 *
 * On cherche la livraison la plus RÉCENTE qui porte la même clé, et on
 * n'en ouvre une nouvelle que si la dernière date de plus de six heures.
 * Sans cette fenêtre, relancer la même séquence demain écraserait celle
 * d'hier ; sans regroupement du tout, cinq emails feraient cinq lignes
 * que personne ne recollerait dans l'ordre.
 */
const FENETRE_MS = 6 * 60 * 60 * 1000;

/**
 * Les trois colonnes de la reprise, ASSAINIES avant d'entrer.
 *
 * `assainirProjet` borne la FORME et la TAILLE : ces valeurs viennent
 * d'un corps de requête, et un écran modifié pourrait y mettre n'importe
 * quoi. Elles ressortiront par `lireContenu`, qui les rassainit à la
 * lecture : les deux passages sont voulus, l'écriture protège la base et
 * la lecture protège une ligne écrite avant cette règle.
 */
function colonnesProjet(projet: ProjetEnregistre) {
  const propre = assainirProjet(projet);
  return { brief: propre.brief, pistes: propre.pistes, piste: propre.piste };
}

export async function rangerMorceau(
  cle: CleLivraison,
  morceau: MorceauEnregistre,
): Promise<void> {
  try {
    const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
    let requete = supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("user_id", cle.userId)
      .eq("generateur", cle.generateur)
      .eq("titre", cle.titre)
      .gte("created_at", depuis)
      .order("created_at", { ascending: false })
      .limit(1);
    requete = cle.quizId ? requete.eq("quiz_id", cle.quizId) : requete.is("quiz_id", null);
    requete =
      cle.profilIndex === null
        ? requete.is("profil_index", null)
        : requete.eq("profil_index", cle.profilIndex);

    const { data, error } = await requete;
    if (error) {
      console.error("[generateurs] lecture de la livraison impossible :", error.message);
      return;
    }

    const existante = lireContenu((data ?? [])[0] as Record<string, unknown> | undefined);
    if (existante) {
      // Le morceau REMPLACE celui de même bloc, même rang ET MÊME
      // PROFIL : relancer l'email 3 doit écraser le 3, pas en ajouter un
      // sixième. Le profil fait partie de la clé, sinon écrire le
      // contenu du 2e profil d'un bonus décliné effacerait celui du 1er,
      // et elle ne s'en apercevrait qu'en rouvrant.
      const memeProfil = (a: number | null | undefined, b: number | null | undefined) =>
        (a ?? null) === (b ?? null);
      const morceaux = existante.morceaux.filter(
        (m) =>
          !(
            m.bloc === morceau.bloc &&
            m.index === morceau.index &&
            memeProfil(m.profil, morceau.profil)
          ),
      );
      morceaux.push(morceau);
      morceaux.sort(
        (a, b) =>
          a.bloc.localeCompare(b.bloc) ||
          a.index - b.index ||
          (a.profil ?? -1) - (b.profil ?? -1),
      );
      // LE PROJET EST RÉÉCRIT, PAS FUSIONNÉ : elle a pu corriger son
      // offre entre deux morceaux, et c'est le dernier état qu'elle doit
      // retrouver.
      const base = { pieces: morceaux, updated_at: new Date().toISOString() };
      const { error: e2 } = await supabaseAdmin
        .from(TABLE)
        .update({ ...base, ...colonnesProjet(cle.projet) })
        .eq("id", existante.id);
      if (e2) {
        console.error("[generateurs] mise a jour avec la reprise :", e2.message);
        const { error: e2b } = await supabaseAdmin
          .from(TABLE)
          .update(base)
          .eq("id", existante.id);
        if (e2b) console.error("[generateurs] mise a jour de la livraison :", e2b.message);
      }
      return;
    }

    const ligne = {
      user_id: cle.userId,
      project_id: cle.projectId,
      quiz_id: cle.quizId,
      quiz_titre: cle.quizTitre,
      generateur: cle.generateur,
      titre: cle.titre,
      profil_index: cle.profilIndex,
      profil_titre: cle.profilTitre,
      pieces: [morceau],
    };
    const { error: e3 } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...ligne, ...colonnesProjet(cle.projet) });
    if (e3) {
      console.error("[generateurs] creation avec la reprise :", e3.message);
      const { error: e3b } = await supabaseAdmin.from(TABLE).insert(ligne);
      if (e3b) console.error("[generateurs] creation de la livraison :", e3b.message);
    }
  } catch (e) {
    // Un contenu non enregistré est un contenu qu'elle a quand même
    // sous les yeux. Faire echouer la génération pour ça serait perdre
    // le texte ET l'argent.
    console.error("[generateurs] enregistrement impossible :", e instanceof Error ? e.message : e);
  }
}

/** Les livraisons d'une personne, les plus récentes d'abord. */
export async function lireContenus(
  userId: string,
  limite = 120,
): Promise<{ contenus: ContenuGenere[]; erreur: boolean }> {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) {
      console.error("[generateurs] lecture de la bibliotheque :", error.message);
      return { contenus: [], erreur: true };
    }
    const contenus = (data ?? [])
      .map((l) => lireContenu(l as Record<string, unknown>))
      .filter((c): c is ContenuGenere => c !== null);
    return { contenus, erreur: false };
  } catch (e) {
    console.error("[generateurs] lecture impossible :", e instanceof Error ? e.message : e);
    return { contenus: [], erreur: true };
  }
}

/**
 * UNE livraison, pour la reprendre.
 *
 * LE FILTRE PAR PERSONNE EST DANS LA REQUÊTE, pas dans un `if` au
 * dessus : c'est lui qui empêche de rouvrir le travail de quelqu'un
 * d'autre avec un identifiant deviné. Et on ne distingue pas "ça
 * n'existe pas" de "ce n'est pas à toi" : le dire révélerait qu'un
 * contenu existe.
 */
export async function lireContenuParId(
  userId: string,
  id: string,
): Promise<ContenuGenere | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[generateurs] lecture d'une livraison :", error.message);
      return null;
    }
    return lireContenu(data as Record<string, unknown> | null);
  } catch (e) {
    console.error("[generateurs] lecture impossible :", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Supprime une livraison. Rend `false` quand elle n'appartient pas à la personne. */
export async function supprimerContenu(userId: string, id: string): Promise<boolean> {
  try {
    const { error, count } = await supabaseAdmin
      .from(TABLE)
      .delete({ count: "exact" })
      .eq("id", id)
      // LE FILTRE PAR PERSONNE EST DANS LA REQUÊTE, pas dans un `if`
      // au dessus : c'est lui qui empêche de supprimer le travail de
      // quelqu'un d'autre avec un identifiant deviné.
      .eq("user_id", userId);
    if (error) {
      console.error("[generateurs] suppression :", error.message);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (e) {
    console.error("[generateurs] suppression impossible :", e instanceof Error ? e.message : e);
    return false;
  }
}
