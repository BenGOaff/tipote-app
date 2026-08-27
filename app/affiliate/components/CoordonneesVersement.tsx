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
// -- LE PROFIL FISCAL EST SUR LE MÊME ÉCRAN, ET C'EST VOULU -----------
//
// "Où j'envoie l'argent" et "sur quelle pièce" sont les deux moitiés de
// la même question. Deux écrans donneraient deux formulaires à moitié
// remplis, et une affiliée qui ne comprend pas pourquoi elle n'est
// toujours pas payée alors qu'elle a bien mis son IBAN.
//
// Les deux restent DISTINCTS dans ce que le serveur renvoie : l'écran
// doit pouvoir dire lequel manque.
//
// -- LE SERVEUR RENVOIE UNE RAISON, L'ÉCRAN LA TRADUIT -----------------
//
// L'espace affilié existe en six langues. Même règle que la suppression
// d'un quiz (3 août) et que l'import PDF (7 août).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Check, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { optionsPays } from "@/lib/facture/pays";
import type { AffiliateDict } from "../i18n/types";

type Methode = "paypal" | "virement";
type Statut = "entreprise" | "particulier";

interface Profil {
  statut: Statut | null;
  denomination: string | null;
  adresse1: string | null;
  adresse2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  siren: string | null;
  numeroTva: string | null;
  assujettiTva: boolean;
  mandatAccepteLe: string | null;
}

interface FactureVue {
  numero: string;
  periode: string;
  libelle: string;
  ttc_cents: number;
  emise_le: string;
}

const PROFIL_VIDE: Profil = {
  statut: null, denomination: null, adresse1: null, adresse2: null,
  codePostal: null, ville: null, pays: null, siren: null, numeroTva: null,
  assujettiTva: false, mandatAccepteLe: null,
};

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

function Champ({
  label, valeur, onChange, mono,
}: {
  label: string;
  valeur: string | null;
  onChange: (v: string | null) => void;
  mono?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type="text"
        value={valeur ?? ""}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
        className={mono ? `${champ} font-mono` : champ}
        autoComplete="off"
      />
    </label>
  );
}

export default function CoordonneesVersement({ t }: { t: AffiliateDict }) {
  const p = t.paiement;
  const pays = useMemo(() => optionsPays("fr"), []);
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
  const [profil, setProfil] = useState<Profil>(PROFIL_VIDE);
  const [manquesFiscaux, setManquesFiscaux] = useState<string[]>([]);

  // SON SIREN OU SON NUMÉRO DE TVA REMPLIT SA FICHE (Béné, 27 août 2026).
  //
  // "On utilise tout ce qu'on peut pour limiter les risques d'erreur et
  // les actions à faire."
  //
  // Ce n'est pas un confort de saisie : un profil fiscal incomplet
  // ÉCARTE l'affilié du lot de versement. Il a gagné son argent, il ne
  // le reçoit pas, et il faut lui écrire. Chaque champ rempli à sa place
  // est une occasion de moins de rester bloqué.
  const [recherche, setRecherche] = useState<
    { etat: "encours" } | { etat: "fait"; texte: string; ok: boolean } | null
  >(null);

  async function chercherIdentite(quoi: "siren" | "numeroTva") {
    const valeur = String(profil[quoi] ?? "").trim();
    if (!valeur) return;
    setRecherche({ etat: "encours" });
    try {
      const r = await fetch("/api/affiliate/identite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [quoi]: valeur }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        source?: string;
        trouve?: boolean;
        verdict?: string;
        identite?: {
          denomination?: string | null;
          nom?: string | null;
          adresse?: string | null;
          codePostal?: string | null;
          ville?: string | null;
        };
      };
      if (!j.ok) {
        setRecherche({ etat: "fait", texte: p.identite_injoignable, ok: false });
        return;
      }
      if (j.source === "vies" && j.verdict === "invalide") {
        setRecherche({ etat: "fait", texte: p.identite_tva_invalide, ok: false });
        return;
      }
      if (j.source === "vies" && j.verdict !== "valide") {
        setRecherche({ etat: "fait", texte: p.identite_injoignable, ok: false });
        return;
      }
      if (j.source === "sirene" && !j.trouve) {
        setRecherche({ etat: "fait", texte: p.identite_siren_absent, ok: false });
        return;
      }
      // ON NE REMPLACE JAMAIS UNE SAISIE, on ne remplit que le vide :
      // quelqu'un qui a corrigé son adresse la semaine dernière ne doit
      // pas la voir écrasée par un fichier de l'État.
      const suivant = { ...profil };
      let rempli = 0;
      const poser = (champ: "denomination" | "adresse1" | "codePostal" | "ville", v?: string | null) => {
        if (v && !String(suivant[champ] ?? "").trim()) {
          suivant[champ] = v;
          rempli += 1;
        }
      };
      poser("denomination", j.identite?.denomination ?? j.identite?.nom ?? null);
      poser("adresse1", j.identite?.adresse ?? null);
      poser("codePostal", j.identite?.codePostal ?? null);
      poser("ville", j.identite?.ville ?? null);
      if (rempli) setProfil(suivant);
      setRecherche({
        etat: "fait",
        // Rien à remplir n'est pas un échec : c'est souvent que tout est
        // déjà saisi, ou que l'État ne publie pas ces champs (Allemagne,
        // Espagne). Le dire évite de faire chercher un problème.
        texte: rempli ? p.identite_remplie : p.identite_rien_a_remplir,
        ok: true,
      });
    } catch {
      setRecherche({ etat: "fait", texte: p.identite_injoignable, ok: false });
    }
  }

  /** Le bouton, identique pour les deux champs. */
  function BoutonChercher({ quoi, actif }: { quoi: "siren" | "numeroTva"; actif: boolean }) {
    return (
      <button
        type="button"
        onClick={() => void chercherIdentite(quoi)}
        disabled={!actif || recherche?.etat === "encours"}
        className="h-10 shrink-0 self-end rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {recherche?.etat === "encours" ? p.identite_en_cours : p.identite_bouton}
      </button>
    );
  }
  const [mandatCoche, setMandatCoche] = useState(false);
  const [factures, setFactures] = useState<FactureVue[]>([]);
  const [texteMandat, setTexteMandat] = useState<string[]>([]);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/affiliate/coordonnees");
      const j = (await r.json()) as {
        ok?: boolean;
        coordonnees?: Vue | null;
        profil?: Profil | null;
        manquesFiscaux?: string[];
        mandat?: { texte?: string[] };
        factures?: FactureVue[];
      };
      if (j.ok && j.coordonnees) {
        setVue(j.coordonnees);
        setMethode(j.coordonnees.choixExplicite ? j.coordonnees.methode : null);
        setPaypalEmail(j.coordonnees.paypalEmail ?? "");
        setTitulaire(j.coordonnees.titulaire ?? "");
        setBic(j.coordonnees.bic ?? "");
        setRemplaceIban(!j.coordonnees.ibanMasque);
      }
      if (j.ok) {
        setProfil(j.profil ?? PROFIL_VIDE);
        setManquesFiscaux(j.manquesFiscaux ?? []);
        setMandatCoche(!!j.profil?.mandatAccepteLe);
        setTexteMandat(j.mandat?.texte ?? []);
        setFactures(j.factures ?? []);
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
    statut: p.err_statut,
    denomination: p.err_denomination,
    adresse: p.err_adresse,
    ville: p.err_ville,
    pays: p.err_pays,
    siren: p.err_siren,
    "siren-invalide": p.err_siren_invalide,
    "tva-numero": p.err_tva_numero,
    "tva-numero-invalide": p.err_tva_numero_invalide,
    mandat: p.err_mandat,
  };

  async function enregistrer() {
    // PLUS DE REFUS EN BLOC (Béné, 27 août 2026). "Je ne peux pas
    // enregistrer Tes informations pour la facture, donc quand je
    // reviens dessus rien n'a été sauvegardé."
    //
    // Ce garde renvoyait sans rien envoyer tant qu'aucun moyen de
    // versement n'était choisi, et le serveur faisait la même chose de
    // son côté : elle remplissait son adresse et son SIREN, cliquait, et
    // tout partait à la poubelle parce qu'il manquait son IBAN. Les deux
    // blocs sont indépendants, le serveur enregistre chacun dès qu'il
    // est valide et DIT ce qui n'est pas passé.
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
          profil,
          accepteLeMandat: mandatCoche,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        versementEnregistre?: boolean;
        manques?: string[];
        manquesFiscaux?: string[];
        coordonnees?: Vue;
        profil?: Profil;
        factures?: FactureVue[];
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
      if (j.profil) setProfil(j.profil);
      setManquesFiscaux(j.manquesFiscaux ?? []);
      setFactures(j.factures ?? []);
      // DIRE CE QUI EST PASSÉ, ET CE QUI NE L'EST PAS. Annoncer
      // "enregistré" sur un formulaire dont la moitié n'est pas partie
      // est exactement le silence qui a fait perdre sa saisie à Béné.
      if (j.versementEnregistre) {
        setMessage({ ok: true, texte: p.saved });
      } else {
        const premier = j.manques?.[0];
        setMessage({
          ok: true,
          texte: `${p.saved_facture_seule} ${(premier && RAISONS[premier]) || p.err_methode_inconnue}`,
        });
      }
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

        {/* ── LE PROFIL FISCAL ET LE MANDAT ────────────────────────
            "Où j'envoie l'argent" et "sur quelle pièce" sont les deux
            moitiés de la même question : deux écrans donneraient deux
            formulaires à moitié remplis. */}
        <div className="space-y-4 border-t pt-5">
          <div>
            <h2 className="text-lg font-semibold">{p.fiscal_title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p.fiscal_body}</p>
          </div>

          {recherche?.etat === "fait" && (
            <p className={`text-xs ${recherche.ok ? "text-emerald-700" : "text-muted-foreground"}`}>
              {recherche.texte}
            </p>
          )}

          {manquesFiscaux.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {RAISONS[manquesFiscaux[0]] ?? p.err_statut}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {(["entreprise", "particulier"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setProfil({ ...profil, statut: v })}
                className={`flex-1 rounded-xl border p-4 text-left transition ${
                  profil.statut === v
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <span className="font-semibold">
                  {v === "entreprise" ? p.statut_entreprise : p.statut_particulier}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {v === "entreprise" ? p.statut_entreprise_hint : p.statut_particulier_hint}
                </span>
              </button>
            ))}
          </div>

          {profil.statut && (
            <div className="space-y-3">
              <Champ
                label={p.label_denomination}
                valeur={profil.denomination}
                onChange={(v) => setProfil({ ...profil, denomination: v })}
              />
              <Champ
                label={p.label_adresse}
                valeur={profil.adresse1}
                onChange={(v) => setProfil({ ...profil, adresse1: v })}
              />
              <Champ
                label={p.label_adresse2}
                valeur={profil.adresse2}
                onChange={(v) => setProfil({ ...profil, adresse2: v })}
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <Champ
                  label={p.label_code_postal}
                  valeur={profil.codePostal}
                  onChange={(v) => setProfil({ ...profil, codePostal: v })}
                />
                <Champ
                  label={p.label_ville}
                  valeur={profil.ville}
                  onChange={(v) => setProfil({ ...profil, ville: v })}
                />
              </div>

              <label className="block text-sm font-medium">
                {p.label_pays}
                <select
                  value={profil.pays ?? ""}
                  onChange={(e) => setProfil({ ...profil, pays: e.target.value || null })}
                  className={champ}
                >
                  <option value="">-</option>
                  {pays.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              </label>

              {/* LE SIREN N'EXISTE QU'EN FRANCE, et un particulier n'en
                  a pas : lui en réclamer un serait un formulaire qu'il
                  n'aura jamais fini. */}
              {profil.statut === "entreprise" && profil.pays === "FR" && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Champ
                      label={p.label_siren}
                      valeur={profil.siren}
                      onChange={(v) => {
                        setRecherche(null);
                        setProfil({ ...profil, siren: v });
                      }}
                      mono
                    />
                  </div>
                  <BoutonChercher quoi="siren" actif={!!String(profil.siren ?? "").trim()} />
                </div>
              )}

              {profil.statut === "entreprise" && (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={profil.assujettiTva}
                      onChange={(e) => setProfil({ ...profil, assujettiTva: e.target.checked })}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{p.assujetti_label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {p.assujetti_hint}
                      </span>
                    </span>
                  </label>
                  {(profil.assujettiTva || (profil.pays && profil.pays !== "FR")) && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Champ
                          label={p.label_tva_numero}
                          valeur={profil.numeroTva}
                          onChange={(v) => {
                            setRecherche(null);
                            setProfil({ ...profil, numeroTva: v });
                          }}
                          mono
                        />
                      </div>
                      <BoutonChercher
                        quoi="numeroTva"
                        actif={!!String(profil.numeroTva ?? "").trim()}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* LE MANDAT. Sans lui on n'émet rien : écrire une facture au
              nom de quelqu'un sans son accord n'est pas une facilité. */}
          <div className="rounded-lg border border-dashed p-3">
            <p className="text-sm font-semibold">{p.mandat_title}</p>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              {texteMandat.map((ligne, i) => (
                <p key={i}>{ligne}</p>
              ))}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={mandatCoche}
                onChange={(e) => setMandatCoche(e.target.checked)}
                className="mt-1"
              />
              <span>{p.mandat_accept}</span>
            </label>
            {profil.mandatAccepteLe && (
              <p className="mt-2 text-xs text-emerald-700">
                {p.mandat_accepted_on.replace(
                  "{date}",
                  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
                    new Date(profil.mandatAccepteLe),
                  ),
                )}
              </p>
            )}
            {!profil.mandatAccepteLe && (
              <p className="mt-2 text-xs text-amber-700">{p.mandat_required}</p>
            )}
          </div>
        </div>

        {/* ── SES FACTURES ──────────────────────────────────────── */}
        <div className="space-y-2 border-t pt-5">
          <h2 className="text-lg font-semibold">{p.factures_title}</h2>
          {factures.length === 0 ? (
            <p className="text-sm text-muted-foreground">{p.factures_empty}</p>
          ) : (
            <ul className="divide-y text-sm">
              {factures.map((f) => (
                <li key={f.numero} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-xs">{f.numero}</span>
                  <span className="flex-1 truncate text-muted-foreground">{f.libelle}</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(f.ttc_cents / 100)}
                  </span>
                  {/* Nouvel onglet : partir lire une facture ne doit pas
                      faire perdre ce qu'on modifie au dessus. */}
                  <a
                    href={`/facture-affilie/${encodeURIComponent(f.numero)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    {p.factures_open}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{p.factures_note}</p>
        </div>
      </CardContent>
    </Card>
  );
}
