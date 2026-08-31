// app/api/upload/asset/route.ts
//
// ÉCRIT UNE IMAGE SUR NOTRE SERVEUR, PLUTÔT QUE CHEZ SUPABASE.
//
// Béné, 26 août 2026 : "on a un super serveur quasiment inutilisé : on
// ne peut pas l'exploiter davantage ? Histoire de ne pas avoir un
// abonnement en plus à payer et d'éviter les futures alertes."
//
// Le stockage Supabase est à 73 % du plan gratuit (1 Go). Ce serveur est
// à 47 Go sur 400, avec une sauvegarde hebdomadaire automatique.
//
// -- ON NE MIGRE RIEN, ON CHANGE LA DESTINATION DES NOUVEAUX -----------
//
// C'est exactement ce qui a été fait pour les vidéos de Popquiz, et le
// dépôt en porte encore la trace : `isSelfHostedPath()` distingue un
// chemin auto-hébergé d'un ancien chemin Supabase, et le code sert les
// deux. Ici c'est encore plus simple, parce que les adresses sont
// stockées ENTIÈRES dans la base : une ligne qui porte une URL
// `supabase.co` continue de marcher pour toujours, sans une ligne de
// code pour la gérer.
//
// -- LA SÉCURITÉ, QUI EST TOUT LE SUJET --------------------------------
//
// Cette route écrit sur le disque à partir de ce qu'envoie un
// navigateur. Trois gardes, et la décision de chemin vit dans un module
// PUR et testé (`lib/storage/cheminAsset.ts`) plutôt qu'ici :
//
// 1. **La session dit QUI écrit.** Le `userId` du chemin doit être celui
//    de la session, jamais celui du corps : sans ça, une créatrice
//    pourrait remplacer le logo d'une autre.
// 2. **Liste blanche de dossiers et d'extensions.** Une liste noire
//    oublie toujours la prochaine extension.
// 3. **Aucun chemin relatif ni absolu**, et le fichier écrit est le
//    chemin NETTOYÉ, jamais celui reçu.

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { DOSSIER_ASSETS_DEFAUT, urlAssetLocal, validerCheminAsset } from "@/lib/storage/cheminAsset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le dossier servi par nginx. Voir le bloc `location ^~ /assets/` dans `infra/nginx/videos.*.conf`. */
const DOSSIER = (process.env.ASSETS_DIR ?? DOSSIER_ASSETS_DEFAUT).replace(/\/+$/, "");

/**
 * 12 Mo. Les images sont déjà compressées côté navigateur (WebP q92,
 * bord max 2400 px) : au delà, ce n'est plus une photo de quiz. La
 * limite protège le disque d'un envoi malveillant, pas les créatrices.
 */
const TAILLE_MAX = 12 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const base = urlAssetLocal("x", process.env.NEXT_PUBLIC_ASSETS_BASE_URL);
  if (!base) {
    // L'hébergement local n'est pas configuré sur CE serveur. Ce n'est
    // pas une panne : le client retombe sur Supabase, comme avant.
    return NextResponse.json({ ok: false, reason: "non_configure" }, { status: 503 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const fichier = form.get("file");
  if (!(fichier instanceof Blob)) {
    return NextResponse.json({ ok: false, reason: "no_file" }, { status: 400 });
  }
  if (fichier.size <= 0 || fichier.size > TAILLE_MAX) {
    return NextResponse.json({ ok: false, reason: "taille" }, { status: 413 });
  }

  // LE `userId` VIENT DE LA SESSION. C'est le garde-fou principal.
  const verdict = validerCheminAsset(form.get("path"), user.id);
  if (!verdict.ok) {
    console.warn(`[upload/asset] chemin refuse pour ${user.id} : ${verdict.raison}`);
    return NextResponse.json({ ok: false, reason: verdict.raison }, { status: 400 });
  }

  const cible = resolve(DOSSIER, verdict.chemin);
  // DÉFENSE EN PROFONDEUR. `validerCheminAsset` a déjà refusé tout ce
  // qui remonte, mais on vérifie le chemin RÉSOLU : c'est la seule
  // vérification qui ne dépend d'aucun raisonnement sur les chaînes.
  if (cible !== join(DOSSIER, verdict.chemin) || !cible.startsWith(DOSSIER + sep)) {
    console.error(`[upload/asset] chemin resolu hors du dossier : ${cible}`);
    return NextResponse.json({ ok: false, reason: "forme_invalide" }, { status: 400 });
  }

  try {
    await mkdir(dirname(cible), { recursive: true });
    await writeFile(cible, Buffer.from(await fichier.arrayBuffer()));
  } catch (e) {
    // Disque plein, droits manquants : le client doit pouvoir retomber
    // sur Supabase plutôt que de perdre l'envoi de la créatrice.
    console.error(`[upload/asset] ecriture impossible (${cible}) : ${(e as Error).message}`);
    return NextResponse.json({ ok: false, reason: "ecriture" }, { status: 500 });
  }

  const url = urlAssetLocal(verdict.chemin, process.env.NEXT_PUBLIC_ASSETS_BASE_URL);
  return NextResponse.json({ ok: true, url, path: verdict.chemin });
}
