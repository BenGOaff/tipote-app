// app/api/cron/recompense-affilies/route.ts
//
// LE RECALCUL MENSUEL DE LA RÉCOMPENSE DES AFFILIÉS.
//
// Béné, 25 août 2026 : "il a 10 affiliés abonnés, son abonnement baisse
// de 10 %" et "il peut switcher quand il veut de l'un à l'autre, ce sera
// pris en compte pour le mois suivant".
//
// -- POURQUOI UNE FOIS PAR MOIS, ET PAS À LA VOLÉE ---------------------
//
// Parce que la promesse est mensuelle. Un calcul fait à l'affichage
// donnerait un taux qui bouge entre deux pages, et surtout : la
// récompense DESCEND quand un filleul arrête de payer. Recalculer en
// continu ferait baisser une remise en cours de mois, c'est à dire
// augmenter le prix de quelqu'un sans prévenir. Le recalcul mensuel est
// la seule forme qui permette d'annoncer avant d'appliquer.
//
// C'est aussi ce qui rend le changement de choix honnête sans stocker de
// date d'effet : le recalcul lit le choix DU MOMENT, donc changer d'avis
// le 12 ne touche rien avant le passage suivant.
//
// -- LA COMMANDE À POSER SUR LE SERVEUR --------------------------------
//
// Une fois par mois, le 2 à 3 h, AVANT celle de Tiquiz qui applique :
//
//   0 3 2 * * cd /home/tipote/tipote-app && ( set -a; . .env; set +a; curl -fsS -H "X-Cron-Secret: $CRON_SECRET" https://app.tipote.com/api/cron/recompense-affilies ) >> /tmp/recompense-affilies.log 2>&1
//
// Les parenthèses ne sont pas cosmétiques : elles font un sous-shell, et
// tout ce que `.env` exporte meurt avec lui. Sans elles, les variables
// survivent dans le terminal et se retrouvent dans le prochain build
// (panne du 22 août, les deux apps ont servi la base de l'autre).
//
// -- CE QU'EST UN FILLEUL ACTIF ----------------------------------------
//
// Quelqu'un qui a généré une commission dans les 35 derniers jours,
// c'est à dire qui a PAYÉ son mois. Ni un inscrit gratuit, ni un essai,
// ni quelqu'un qui a été remboursé (les commissions annulées sont
// exclues). Compter autre chose ouvrirait la porte aux faux filleuls, et
// cette récompense se paie en argent réel.
//
// 35 jours et pas 30 : un prélèvement mensuel peut glisser de quelques
// jours, et quelqu'un qui paie le 3 puis le 5 ne doit pas disparaître du
// décompte parce que le mois faisait 31 jours.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recompenseDuMois } from "@/lib/affiliate/recompense";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// LA MÊME PORTE QUE LES AUTRES CRONS DE TIPOTE, et c'est important.
//
// Tipote authentifie ses crons par le header `X-Cron-Secret` ; Tiquiz,
// lui, par `Authorization: Bearer` et un `?secret=`. Les deux
// conventions coexistent depuis longtemps, et ce n'est pas un problème
// tant que chaque app garde la sienne : ce qui coûte, c'est une route
// qui s'écarte de la maison, parce que la commande recopiée d'un cron
// voisin répond alors 401 sans dire pourquoi.
//
// Et pas de `?secret=` ici : un secret dans une URL finit dans
// l'historique du shell et dans les journaux d'accès.
const CRON_SECRET = (process.env.CRON_SECRET ?? "").trim();

function autorise(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const recu = req.headers.get("x-cron-secret")?.trim() || "";
  // Comparaison à durée constante : une comparaison naïve s'arrête au
  // premier caractère différent, et son TEMPS raconte combien de
  // caractères sont justes (règle du 24 août).
  if (recu.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(recu), Buffer.from(CRON_SECRET));
}

/** La fenêtre qui définit "il paie encore". */
const FENETRE_JOURS = 35;

/** Les statuts de commission qui ne comptent pas : l'argent est reparti. */
const NON_COMPTES = new Set(["cancelled", "rejected"]);

export async function GET(req: NextRequest) {
  if (!autorise(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const depuis = new Date(Date.now() - FENETRE_JOURS * 24 * 3600 * 1000).toISOString();

  // Les commissions récentes, en une requête. On lit `customer_email`
  // pour compter des PERSONNES : un filleul qui paie deux fois dans la
  // fenêtre (mensuel + un rattrapage) ne vaut pas deux filleuls.
  const { data: comms, error: errComms } = await supabaseAdmin
    .from("affiliate_commissions")
    .select("sa, customer_email, status")
    .gte("sale_at", depuis)
    .limit(50_000);

  if (errComms) {
    console.error(`[cron/recompense] commissions illisibles : ${errComms.message}`);
    // 502 : rien n'est écrit. "Je n'ai pas pu regarder" et "il n'y a
    // personne" n'appellent pas la même suite, et confondre les deux
    // remettrait toutes les récompenses à zéro.
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
  }

  const parSa = new Map<string, Set<string>>();
  for (const c of (comms ?? []) as { sa: string; customer_email: string; status: string }[]) {
    if (NON_COMPTES.has(String(c.status ?? ""))) continue;
    const sa = String(c.sa ?? "").trim();
    const email = String(c.customer_email ?? "").trim().toLowerCase();
    if (!sa || !email) continue;
    if (!parSa.has(sa)) parSa.set(sa, new Set());
    parSa.get(sa)!.add(email);
  }

  const { data: affs, error: errAffs } = await supabaseAdmin
    .from("affiliates")
    .select("sa, recompense_choix, recompense_remise_pct, recompense_commission_pct")
    .limit(10_000);

  if (errAffs) {
    console.error(
      `[cron/recompense] affilies illisibles (migration 20260825_recompense_affilies appliquee ?) : ${errAffs.message}`,
    );
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
  }

  type Aff = {
    sa: string;
    recompense_choix?: string | null;
    recompense_remise_pct?: number | null;
    recompense_commission_pct?: number | null;
  };

  const maintenant = new Date().toISOString();
  let ecrits = 0;
  const changements: string[] = [];

  for (const a of (affs ?? []) as Aff[]) {
    const filleuls = parSa.get(a.sa)?.size ?? 0;
    const r = recompenseDuMois(a.recompense_choix, filleuls);

    // ON N'ÉCRIT QUE CE QUI BOUGE. Une écriture par affilié à chaque
    // passage ferait un bruit inutile, et surtout ferait mentir
    // `recompense_calculee_le`, qu'on veut pouvoir lire comme "la
    // dernière fois que sa récompense a CHANGÉ n'est pas si loin".
    const memeRemise = Number(a.recompense_remise_pct ?? 0) === r.remiseAboPct;
    const memeTaux = Number(a.recompense_commission_pct ?? 40) === r.commissionPct;
    if (memeRemise && memeTaux) continue;

    const { error } = await supabaseAdmin
      .from("affiliates")
      .update({
        recompense_filleuls: r.filleulsActifs,
        recompense_remise_pct: r.remiseAboPct,
        recompense_commission_pct: r.commissionPct,
        recompense_calculee_le: maintenant,
      })
      .eq("sa", a.sa);

    if (error) {
      // On continue : un affilié qu'on n'a pas pu mettre à jour ne doit
      // pas empêcher les autres d'avoir leur récompense.
      console.error(`[cron/recompense] ecriture impossible pour ${a.sa} : ${error.message}`);
      continue;
    }
    ecrits += 1;
    changements.push(
      `${a.sa} : ${r.filleulsActifs} filleuls -> ${r.choix === "abonnement" ? `-${r.remiseAboPct}% abo` : `${r.commissionPct}% com`}`,
    );
  }

  // Le journal porte le détail : une récompense qui bouge est de
  // l'argent qui bouge, et il faut pouvoir dire pourquoi trois mois plus
  // tard.
  if (changements.length > 0) {
    console.log(`[cron/recompense] ${ecrits} affilies mis a jour : ${changements.join(" | ")}`);
  }

  return NextResponse.json({
    ok: true,
    affilies: (affs ?? []).length,
    misAJour: ecrits,
    fenetreJours: FENETRE_JOURS,
  });
}
