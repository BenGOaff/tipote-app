// lib/storage/televerser.ts
//
// UN SEUL ENDROIT DÉCIDE OÙ VA UN FICHIER TÉLÉVERSÉ.
//
// Il y avait QUINZE appels à `supabase.storage.from("public-assets")
// .upload(...)` recopiés dans les composants. Changer de destination
// demandait donc quinze modifications, et il aurait suffi d'en oublier
// une pour que la moitié des images parte encore chez Supabase sans que
// rien ne le signale.
//
// C'est le motif de ce dépôt depuis trois mois : les réseaux de partage,
// l'affichage du score, l'alignement du sous-titre, la disposition des
// réponses. **Une décision recopiée finit toujours par diverger.**
//
// -- LA BASCULE EST UNE VARIABLE, ET ELLE EST VALIDÉE ------------------
//
// `NEXT_PUBLIC_ASSETS_BASE_URL` absente ou invalide -> Supabase, comme
// avant. Posée et valide -> notre serveur.
//
// Elle est VALIDÉE et pas seulement lue : un `??` ne protège que de la
// variable absente, jamais de la variable fausse (drame Véronique, 2
// août). Ici une base fausse écrirait des adresses mortes DANS la base
// de données, sur des quiz publiés, et elles y resteraient après
// correction de la variable.
//
// -- ON NE PERD JAMAIS L'ENVOI D'UNE CRÉATRICE ------------------------
//
// Si notre serveur refuse (disque plein, droits, route pas encore
// déployée), on RETOMBE sur Supabase et on le dit dans la console. Une
// image qui part au mauvais endroit se déplace ; une image perdue se
// re-téléverse, et la créatrice ne sait pas pourquoi ça a raté.

import type { SupabaseClient } from "@supabase/supabase-js";

import { baseAssetsValide } from "@/lib/storage/cheminAsset";

const BUCKET = "public-assets";

/** Notre serveur sert-il les images sur ce déploiement ? */
export function hebergementLocalActif(): boolean {
  return baseAssetsValide(process.env.NEXT_PUBLIC_ASSETS_BASE_URL) !== null;
}

/**
 * Téléverse un fichier et rend son URL PUBLIQUE.
 *
 * `chemin` est celui que l'appelant a fabriqué (`logos/<uid>/...`) : il
 * ne change pas selon la destination, et il porte déjà l'horodatage qui
 * rend chaque envoi unique.
 */
export async function televerserAsset(
  supabase: SupabaseClient,
  chemin: string,
  blob: Blob,
): Promise<string> {
  if (hebergementLocalActif()) {
    try {
      const form = new FormData();
      form.append("file", blob);
      form.append("path", chemin);
      const res = await fetch("/api/upload/asset", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; reason?: string };
      if (res.ok && json.ok && json.url) return json.url;
      console.warn(
        `[televerser] notre serveur a refuse (${json.reason ?? res.status}) : ` +
          `on retombe sur Supabase pour ne pas perdre l'envoi.`,
      );
    } catch (e) {
      console.warn(
        `[televerser] notre serveur est injoignable (${e instanceof Error ? e.message : String(e)}) : ` +
          `on retombe sur Supabase.`,
      );
    }
  }

  const { error } = await supabase.storage.from(BUCKET).upload(chemin, blob, { upsert: true });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl;
}
