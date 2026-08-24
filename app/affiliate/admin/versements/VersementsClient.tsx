"use client";

// app/affiliate/admin/versements/VersementsClient.tsx
//
// Écran d'admin, en français seulement : Béné est la seule à le voir.
// Les six langues de l'espace affilié servent aux affiliées.

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Ligne {
  sa: string;
  email: string;
  displayName: string | null;
  methode: "paypal" | "virement";
  montantCents: number;
  commissionIds: string[];
  ibanMasque?: string | null;
}
interface Ecartee {
  sa: string;
  raison: "coordonnees" | "profil-fiscal" | "sous-le-minimum" | "affiliee-inconnue";
  montantCents: number;
}
interface Piece {
  numero: string;
  sa: string;
  email: string;
  ttc_cents: number;
  a_verifier: string[] | null;
}
interface Lot {
  id: string;
  periode: string;
  statut: string;
  total_cents: number;
  total_paypal_cents: number;
  total_virement_cents: number;
  prepare_le: string;
  paye_le: string | null;
  /** Le NOMBRE de virements, jamais les lignes : elles portent les IBAN. */
  nbLignes: number;
}
interface Reponse {
  ok?: boolean;
  apercu?: { lignes: Ligne[]; ecartees: Ecartee[]; totalCents: number } | null;
  lots?: Lot[];
  periode?: string;
  sepaConfigure?: boolean;
}

const RAISONS: Record<Ecartee["raison"], string> = {
  coordonnees: "n'a pas encore dit comment être payée",
  // DISTINCT des coordonnées, et il le faut : dire "coordonnées
  // manquantes" à quelqu'un qui a très bien rempli son IBAN et qui a
  // juste oublié de cocher le mandat l'envoie chercher au mauvais
  // endroit. Sans mandat on ne peut pas écrire sa facture, et c'est
  // cette facture qui justifie le virement.
  "profil-fiscal": "infos de facturation incomplètes ou mandat non accepté, à relancer",
  "sous-le-minimum": "sous 20 €, reporté au versement suivant",
  "affiliee-inconnue": "affiliée introuvable, à regarder",
};

const euros = (c: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(c / 100);

const jour = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d);
};

export default function VersementsClient() {
  const [data, setData] = useState<Reponse | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  // Les pièces d'un lot ne se chargent qu'à la demande : elles ne
  // servent qu'au moment de la compta, et les charger d'office
  // ralentirait l'écran qu'on ouvre tous les mois pour payer.
  const [pieces, setPieces] = useState<Record<string, Piece[]>>({});

  async function chargerPieces(lotId: string) {
    if (pieces[lotId]) {
      setPieces((p) => {
        const suite = { ...p };
        delete suite[lotId];
        return suite;
      });
      return;
    }
    try {
      const r = await fetch(`/api/affiliate/admin/versements?pieces=${lotId}`, { cache: "no-store" });
      const j = (await r.json()) as { pieces?: Piece[] };
      setPieces((p) => ({ ...p, [lotId]: j.pieces ?? [] }));
    } catch {
      setMessage({ ok: false, texte: "Les factures de ce lot n'ont pas pu être lues." });
    }
  }

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/affiliate/admin/versements", { cache: "no-store" });
      setData((await r.json()) as Reponse);
    } catch {
      setData({ ok: false });
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function agir(action: string, extra: Record<string, unknown> = {}) {
    setEnCours(action);
    setMessage(null);
    try {
      const r = await fetch("/api/affiliate/admin/versements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        approuvees?: number;
      };
      // Un `ok: false` produit TOUJOURS quelque chose à l'écran (3 août).
      if (!j.ok) {
        const dit: Record<string, string> = {
          lot_vide: "Rien à verser : aucune commission approuvée en attente.",
          lot_existe_deja: "Le lot de ce mois existe déjà. Regarde l'historique en dessous.",
          commissions_non_marquees:
            "Le lot est créé mais les commissions n'ont PAS été marquées. RISQUE DE DOUBLE PAIEMENT : vérifie avant de déposer le fichier.",
        };
        setMessage({ ok: false, texte: dit[j.reason ?? ""] ?? `Refusé (${j.reason ?? "raison inconnue"}).` });
        return;
      }
      setMessage({
        ok: true,
        texte:
          action === "approuver"
            ? `${j.approuvees ?? 0} commission(s) approuvée(s).`
            : "Fait.",
      });
      await charger();
    } catch {
      setMessage({ ok: false, texte: "La connexion a coupé." });
    } finally {
      setEnCours(null);
    }
  }

  const apercu = data?.apercu;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-5 text-sm">
          <div>
            <h2 className="text-base font-semibold">1. Faire mûrir les commissions</h2>
            <p className="text-muted-foreground">
              Une commission devient versable 21 jours après la vente, si elle n&apos;a pas été
              remboursée. Le délai de rétractation légal est de 14 jours : une commission déjà
              virée ne se reprend pas.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void agir("approuver")}
            disabled={enCours !== null}
          >
            {enCours === "approuver" ? "..." : "Approuver ce qui est mûr"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              2. Le lot de {data?.periode ?? "ce mois"}
            </h2>
            <span className="text-lg font-bold">{euros(apercu?.totalCents ?? 0)}</span>
          </div>

          {!apercu || apercu.lignes.length === 0 ? (
            <p className="text-muted-foreground">Rien à verser pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y">
              {apercu.lignes.map((l) => (
                <li key={l.sa} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="flex-1 truncate font-medium">
                    {l.displayName || l.email}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {l.methode === "paypal" ? "PayPal" : "Virement"}
                  </span>
                  <span className="font-semibold">{euros(l.montantCents)}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.commissionIds.length} vente(s)
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* CE QUI EST ÉCARTÉ SE VOIT. Elles ont gagné cet argent :
              quelqu'un doit leur écrire. */}
          {apercu && apercu.ecartees.length > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Écartées de ce lot
              </p>
              <ul className="mt-1 space-y-0.5 text-amber-900 dark:text-amber-200">
                {apercu.ecartees.map((e) => (
                  <li key={e.sa}>
                    {e.sa} : {euros(e.montantCents)}, {RAISONS[e.raison]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <Button
              onClick={() => void agir("figer")}
              disabled={enCours !== null || !apercu || apercu.lignes.length === 0}
            >
              {enCours === "figer" ? "..." : "Figer le lot"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Point de non retour : les commissions passent en payé et ne repartiront jamais
              dans un autre lot. C&apos;est ce qui empêche de payer deux fois.
            </p>
          </div>

          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-destructive"}`}>
              {message.texte}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5 text-sm">
          <h2 className="text-base font-semibold">3. Les lots</h2>
          {data?.sepaConfigure === false && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Le fichier SEPA ne peut pas être produit : pose <code>SEPA_DEBTOR_IBAN</code> (et
              <code> SEPA_DEBTOR_BIC</code> si ta banque l&apos;exige) dans le <code>.env</code> du
              serveur. La liste PayPal, elle, se télécharge sans ça.
            </p>
          )}
          {!data?.lots || data.lots.length === 0 ? (
            <p className="text-muted-foreground">Aucun lot pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y">
              {data.lots.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="font-mono">{l.periode}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{l.statut}</span>
                  <span className="flex-1 text-muted-foreground">
                    préparé le {jour(l.prepare_le)}
                    {l.paye_le ? `, payé le ${jour(l.paye_le)}` : ""}
                  </span>
                  <span className="font-semibold">{euros(l.total_cents)}</span>
                  {l.total_virement_cents > 0 && (
                    <a
                      className="text-xs font-semibold text-primary hover:underline"
                      href={`/api/affiliate/admin/versements?fichier=sepa&id=${l.id}`}
                    >
                      SEPA ({euros(l.total_virement_cents)})
                    </a>
                  )}
                  {l.total_paypal_cents > 0 && (
                    <a
                      className="text-xs font-semibold text-primary hover:underline"
                      href={`/api/affiliate/admin/versements?fichier=paypal&id=${l.id}`}
                    >
                      PayPal ({euros(l.total_paypal_cents)})
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void chargerPieces(l.id)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {pieces[l.id] ? "Masquer les factures" : "Les factures"}
                  </button>
                  {l.statut !== "paye" && (
                    <button
                      type="button"
                      onClick={() => void agir("marquer", { id: l.id, statut: "paye" })}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Marquer payé
                    </button>
                  )}

                  {/* LES DEUX COMPTES, CÔTE À CÔTE.
                      Une pièce qui n'a pas pu être émise ne vit sinon que
                      dans `pm2 logs` : elle déposerait le fichier à la
                      banque en croyant sa compta complète. */}
                  {pieces[l.id] && (
                    <div className="w-full rounded-md bg-muted/50 px-3 py-2">
                      {pieces[l.id].length === 0 ? (
                        <p className="text-amber-900 dark:text-amber-200">
                          Aucune facture émise pour ce lot. Les virements sont bons, la compta
                          non : regarde <code>pm2 logs</code>, ligne <code>[autofacture]</code>.
                        </p>
                      ) : (
                        <>
                          <p className="mb-1 text-xs text-muted-foreground">
                            {pieces[l.id].length} facture(s) pour {l.nbLignes} virement(s).
                            {pieces[l.id].length !== l.nbLignes && (
                              <strong className="text-amber-700 dark:text-amber-300">
                                {" "}Les deux comptes diffèrent.
                              </strong>
                            )}
                          </p>
                          <ul className="space-y-0.5">
                            {pieces[l.id].map((f) => (
                              <li key={f.numero} className="flex flex-wrap items-center gap-x-2">
                                <a
                                  className="font-mono text-primary hover:underline"
                                  href={`/facture-affilie/${f.numero}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {f.numero}
                                </a>
                                <span className="flex-1 truncate text-muted-foreground">
                                  {f.email}
                                </span>
                                <span className="font-semibold">{euros(f.ttc_cents)}</span>
                                {f.a_verifier && f.a_verifier.length > 0 && (
                                  <span className="text-xs text-amber-700 dark:text-amber-300">
                                    à vérifier : {f.a_verifier.join(", ")}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
