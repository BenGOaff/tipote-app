"use client";

// app/affiliate/components/CoordonneesVersement.tsx
//
// PAYPAL OU VIREMENT, AU CHOIX DE L'AFFILIÉE.
//
// Béné, 25 août 2026 : "on doit proposer le choix aux affiliés : Paypal
// ou virement bancaire. Ils doivent pouvoir indiquer leur mail paypal OU
// leur rib pour un virement."
//
// -- ON N'AFFICHE QUE LES CHAMPS DE LA MÉTHODE CHOISIE -----------------
//
// Montrer les quatre en même temps, c'est demander à quelqu'un de
// deviner lesquels le concernent, et récolter des formulaires à moitié
// remplis. Le choix vient d'abord, les champs suivent.
//
// -- L'IBAN NE SE RÉAFFICHE JAMAIS EN ENTIER ---------------------------
//
// Pas même à sa propriétaire. Un écran se photographie, se partage, se
// laisse ouvert sur un bureau. Elle voit `FR14••••2606`, ce qui suffit à
// reconnaître le sien ; pour le changer, elle le ressaisit. Deux
// secondes de plus, et une donnée bancaire retirée de tous les
// journaux, caches et captures d'écran.
//
// -- LE SERVEUR RENVOIE UNE RAISON, L'ÉCRAN LA TRADUIT -----------------
//
// L'espace affilié existe en six langues. Même règle que la suppression
// d'un quiz (3 août) et que l'import PDF (7 août).

import { useCallback, useEffect, useState } from "react";
import { Banknote, Check, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AffiliateDict } from "../i18n/types";

type Methode = "paypal" | "virement";

interface Vue {
  methode: Methode | null;
  choixExplicite: boolean;
  paypalEmail: string | null;
  titulaire: string | null;
  ibanMasque: string | null;
  bic: string | null;
  complet: boolean;
}

const champ =
  "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function CoordonneesVersement({ t }: { t: AffiliateDict }) {
  const p = t.paiement;
  const [vue, setVue] = useState<Vue | null>(null);
  const [methode, setMethode] = useState<Methode | null>(null);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [titulaire, setTitulaire] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  // Tant qu'elle n'a pas cliqué "Remplacer", on ne touche pas à l'IBAN
  // enregistré : un champ vide envoyé effacerait ses coordonnées.
  const [remplaceIban, setRemplaceIban] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/affiliate/coordonnees");
      const j = (await r.json()) as { ok?: boolean; coordonnees?: Vue | null };
      if (j.ok && j.coordonnees) {
        setVue(j.coordonnees);
        setMethode(j.coordonnees.choixExplicite ? j.coordonnees.methode : null);
        setPaypalEmail(j.coordonnees.paypalEmail ?? "");
        setTitulaire(j.coordonnees.titulaire ?? "");
        setBic(j.coordonnees.bic ?? "");
        setRemplaceIban(!j.coordonnees.ibanMasque);
      }
    } catch {
      // Un écran vide vaut mieux qu'un écran qui ment.
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Les raisons du serveur, dites dans sa langue. */
  const RAISONS: Record<string, string> = {
    methode: p.err_methode_inconnue,
    "paypal-email": p.err_paypal_email,
    titulaire: p.err_titulaire,
    iban: p.err_iban,
    "iban-invalide": p.err_iban_invalide,
    "bic-invalide": p.err_bic_invalide,
  };

  async function enregistrer() {
    if (!methode) {
      setMessage({ ok: false, texte: p.err_methode_inconnue });
      return;
    }
    setEnvoi(true);
    setMessage(null);
    try {
      const r = await fetch("/api/affiliate/coordonnees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          methode,
          paypalEmail,
          titulaire,
          // Vide quand elle n'a pas demandé à le remplacer : le serveur
          // garde alors celui qui est enregistré.
          iban: remplaceIban ? iban : vue?.ibanMasque ? undefined : iban,
          bic,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        manques?: string[];
        coordonnees?: Vue;
      };
      if (!j.ok) {
        const premier = j.manques?.[0];
        setMessage({ ok: false, texte: (premier && RAISONS[premier]) || p.err_save });
        return;
      }
      if (j.coordonnees) {
        setVue(j.coordonnees);
        setRemplaceIban(!j.coordonnees.ibanMasque);
        setIban("");
      }
      setMessage({ ok: true, texte: p.saved });
    } catch {
      setMessage({ ok: false, texte: p.err_save });
    } finally {
      setEnvoi(false);
    }
  }

  const Choix = ({ valeur, titre, aide, Icone }: {
    valeur: Methode;
    titre: string;
    aide: string;
    Icone: typeof Wallet;
  }) => (
    <button
      type="button"
      onClick={() => setMethode(valeur)}
      className={`flex-1 rounded-xl border p-4 text-left transition ${
        methode === valeur
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <Icone className="h-4 w-4 text-primary" />
        {titre}
        {methode === valeur && <Check className="h-4 w-4 text-primary" />}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">{aide}</span>
    </button>
  );

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div>
          <h2 className="text-lg font-semibold">{p.choose_title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{p.choose_body}</p>
        </div>

        {/* CE QUI MANQUE SE DIT AVANT, PAS APRÈS : ses commissions
            s'accumulent sans qu'elle sache pourquoi rien n'arrive. */}
        {vue && (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              vue.complet
                ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            }`}
          >
            {vue.complet ? p.complete_banner : p.incomplete_banner}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Choix valeur="paypal" titre={p.method_paypal} aide={p.method_paypal_hint} Icone={Wallet} />
          <Choix
            valeur="virement"
            titre={p.method_virement}
            aide={p.method_virement_hint}
            Icone={Banknote}
          />
        </div>

        {methode === "paypal" && (
          <label className="block text-sm font-medium">
            {p.label_paypal_email}
            <input
              type="email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              className={champ}
              autoComplete="email"
            />
          </label>
        )}

        {methode === "virement" && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              {p.label_titulaire}
              <input
                type="text"
                value={titulaire}
                onChange={(e) => setTitulaire(e.target.value)}
                className={champ}
                autoComplete="name"
              />
            </label>

            {vue?.ibanMasque && !remplaceIban ? (
              <div className="rounded-lg border border-dashed p-3 text-sm">
                <p className="font-medium">{p.iban_current}</p>
                <p className="mt-1 font-mono">{vue.ibanMasque}</p>
                <button
                  type="button"
                  onClick={() => setRemplaceIban(true)}
                  className="mt-2 text-sm font-semibold text-primary underline underline-offset-2"
                >
                  {p.iban_replace}
                </button>
              </div>
            ) : (
              <label className="block text-sm font-medium">
                {p.label_iban}
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="FR76 …"
                  className={`${champ} font-mono`}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}

            <label className="block text-sm font-medium">
              {p.label_bic}{" "}
              <span className="font-normal text-muted-foreground">({p.bic_optional})</span>
              <input
                type="text"
                value={bic}
                onChange={(e) => setBic(e.target.value)}
                className={`${champ} font-mono`}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <p className="text-xs text-muted-foreground">{p.iban_stored_note}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void enregistrer()} disabled={envoi || !methode}>
            {envoi ? p.saving : p.save}
          </Button>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-destructive"}`}>
              {message.texte}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{p.minimum_note}</p>
      </CardContent>
    </Card>
  );
}
