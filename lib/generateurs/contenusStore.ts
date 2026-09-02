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

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  lireContenu,
  type ContenuGenere,
  type MorceauEnregistre,
} from "@/lib/generateurs/bibliotheque";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

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
      // Le morceau REMPLACE celui de même bloc et même rang : relancer
      // l'email 3 doit écraser le 3, pas en ajouter un sixième.
      const morceaux = existante.morceaux.filter(
        (m) => !(m.bloc === morceau.bloc && m.index === morceau.index),
      );
      morceaux.push(morceau);
      morceaux.sort((a, b) => a.bloc.localeCompare(b.bloc) || a.index - b.index);
      const { error: e2 } = await supabaseAdmin
        .from(TABLE)
        .update({ pieces: morceaux, updated_at: new Date().toISOString() })
        .eq("id", existante.id);
      if (e2) console.error("[generateurs] mise a jour de la livraison :", e2.message);
      return;
    }

    const { error: e3 } = await supabaseAdmin.from(TABLE).insert({
      user_id: cle.userId,
      project_id: cle.projectId,
      quiz_id: cle.quizId,
      quiz_titre: cle.quizTitre,
      generateur: cle.generateur,
      titre: cle.titre,
      profil_index: cle.profilIndex,
      profil_titre: cle.profilTitre,
      pieces: [morceau],
    });
    if (e3) console.error("[generateurs] creation de la livraison :", e3.message);
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
