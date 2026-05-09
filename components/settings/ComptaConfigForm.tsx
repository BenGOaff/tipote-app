"use client";

// Formulaire de configuration du statut compta (étape 1b).
//
// Pour les users en France, après le country gate. 3 statuts au choix :
// particulier / auto-entrepreneur / SASU. Chacun avec sa sous-config :
//   • particulier : nature des revenus accessoires
//   • AE          : type d'activité, date début, ACRE, versement libé,
//                    franchise TVA
//   • SASU        : SIREN, exercice fiscal, régime TVA, TVA intra,
//                    rémunération dirigeant
//
// Chaque champ a une explication courte + lien vers la source
// officielle (impots.gouv.fr / urssaf.fr / service-public.fr) pour
// que l'user comprenne sans avoir à googler.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, ExternalLink, Building2, User, Briefcase, ArrowLeft } from "lucide-react";
import {
  type AccountingStatus,
  type ParticulierRevenueType,
  type AeActivityType,
  type SasuVatRegime,
  type ComptaProfileSlice,
  emptyComptaSlice,
  SIREN_REGEX,
} from "@/lib/compta/types";

interface Props {
  initial: ComptaProfileSlice;
  /** Si fourni, l'user édite une config existante → bouton "Annuler". */
  onCancel?: () => void;
  /** Patch à envoyer à /api/profile. Le parent gère le fetch + le toast. */
  onSave: (patch: Partial<ComptaProfileSlice>) => Promise<void>;
  pending: boolean;
}

export default function ComptaConfigForm({
  initial,
  onCancel,
  onSave,
  pending,
}: Props) {
  const [status, setStatus] = useState<AccountingStatus | null>(initial.accounting_status);
  const [draft, setDraft] = useState<ComptaProfileSlice>({
    ...emptyComptaSlice(),
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update<K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key as string]) {
      setErrors((e) => {
        const { [key as string]: _, ...rest } = e;
        return rest;
      });
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!status) {
      next.accounting_status = "Choisis un statut.";
    } else if (status === "particulier") {
      if (!draft.particulier_revenue_type) {
        next.particulier_revenue_type = "Indique la nature de tes revenus.";
      }
    } else if (status === "auto_entrepreneur") {
      if (!draft.ae_activity_type) {
        next.ae_activity_type = "Choisis ton type d'activité.";
      }
      if (!draft.ae_started_at) {
        next.ae_started_at = "Renseigne la date de début d'activité.";
      }
    } else if (
      status === "sasu" ||
      status === "sas" ||
      status === "sarl" ||
      status === "eurl"
    ) {
      // Toutes les sociétés partagent la même validation :
      // SIREN obligatoire + exercice fiscal cohérent.
      if (!draft.sasu_siren || !SIREN_REGEX.test(draft.sasu_siren)) {
        next.sasu_siren = "SIREN invalide (9 chiffres exactement).";
      }
      if (!draft.sasu_fiscal_year_calendar && !draft.sasu_fiscal_year_start_month) {
        next.sasu_fiscal_year_start_month = "Indique le mois de début d'exercice.";
      }
      // Régime TVA obligatoire pour les sociétés à l'IS. Pour une
      // EURL à l'IR, la TVA reste optionnelle (souvent en franchise).
      const isAtIS =
        status === "sasu" ||
        status === "sas" ||
        status === "sarl" ||
        (status === "eurl" && draft.eurl_is_election);
      if (isAtIS && !draft.sasu_vat_regime) {
        next.sasu_vat_regime = "Choisis ton régime de TVA.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    // On envoie uniquement les champs liés au statut choisi pour ne
    // pas écraser la sous-config d'un statut qu'on n'utilise plus.
    // Les champs non-pertinents restent à leur valeur DB (ou null
    // si l'user n'avait jamais configuré ce statut).
    const patch: Partial<ComptaProfileSlice> = {
      accounting_status: status,
    };
    if (status === "particulier") {
      patch.particulier_revenue_type = draft.particulier_revenue_type;
    } else if (status === "auto_entrepreneur") {
      patch.ae_activity_type = draft.ae_activity_type;
      patch.ae_started_at = draft.ae_started_at;
      patch.ae_acre = draft.ae_acre;
      patch.ae_versement_liberatoire = draft.ae_versement_liberatoire;
      patch.ae_vat_franchise = draft.ae_vat_franchise;
      patch.ae_urssaf_periodicity = draft.ae_urssaf_periodicity ?? "trimestrielle";
      // Si l'user a dépassé le seuil franchise, on stocke son régime
      // TVA. Sinon on force NULL (cohérent avec la base : un AE en
      // franchise n'a pas de régime TVA actif).
      patch.ae_vat_regime = draft.ae_vat_franchise
        ? null
        : draft.ae_vat_regime ?? "simplifie";
    } else if (
      status === "sasu" ||
      status === "sas" ||
      status === "sarl" ||
      status === "eurl"
    ) {
      // Tronc commun pour toutes les sociétés (SIREN, exercice
      // fiscal, TVA, dirigeant). Stocké dans les colonnes sasu_*
      // historiques pour réutiliser la sémantique.
      patch.sasu_siren = draft.sasu_siren;
      patch.sasu_fiscal_year_calendar = draft.sasu_fiscal_year_calendar;
      patch.sasu_fiscal_year_start_month = draft.sasu_fiscal_year_calendar
        ? null
        : draft.sasu_fiscal_year_start_month;
      patch.sasu_vat_regime = draft.sasu_vat_regime;
      patch.sasu_vat_intra_enabled = draft.sasu_vat_intra_enabled;
      patch.sasu_dirigeant_remunere = draft.sasu_dirigeant_remunere;
      // Spécificités par statut
      if (status === "eurl") {
        patch.eurl_is_election = draft.eurl_is_election;
      }
      if (status === "sarl") {
        patch.sarl_gerant_majoritaire = draft.sarl_gerant_majoritaire;
      }
    }

    await onSave(patch);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StatusPicker
        value={status}
        onChange={(s) => {
          setStatus(s);
          setErrors({});
        }}
      />
      {errors.accounting_status ? (
        <p className="text-xs text-destructive -mt-3">{errors.accounting_status}</p>
      ) : null}

      {status === "particulier" ? (
        <ParticulierFields
          value={draft.particulier_revenue_type}
          onChange={(v) => update("particulier_revenue_type", v)}
          error={errors.particulier_revenue_type}
        />
      ) : null}

      {status === "auto_entrepreneur" ? (
        <AutoEntrepreneurFields
          draft={draft}
          update={update}
          errors={errors}
        />
      ) : null}

      {status === "sasu" ||
      status === "sas" ||
      status === "sarl" ||
      status === "eurl" ? (
        <SasuFields draft={draft} update={update} errors={errors} status={status} />
      ) : null}

      {status ? (
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Enregistrer ma config
              </>
            )}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Annuler
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 3 cartes pour choisir le statut
 * ────────────────────────────────────────────────────────────────── */

function StatusPicker({
  value,
  onChange,
}: {
  value: AccountingStatus | null;
  onChange: (v: AccountingStatus) => void;
}) {
  // 6 cartes : 3 statuts "perso/solo" + 3 sociétés à l'IS. On garde
  // toutes les options dans une seule grille à 3 colonnes pour ne
  // pas multiplier les sections — l'user pige direct ce qui le
  // concerne (sa carte est colorée).
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-base">Quel est ton statut ?</h3>

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Sans société dédiée
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon={<User className="h-5 w-5" />}
            title="Particulier"
            desc="Revenus accessoires (en plus d'un job ou pas d'autre activité). Déclaration dans la 2042 annuelle."
            selected={value === "particulier"}
            onClick={() => onChange("particulier")}
          />
          <StatusCard
            icon={<Briefcase className="h-5 w-5" />}
            title="Auto-entrepreneur"
            desc="Micro-entreprise (régime simplifié). CA déclaré tous les mois/trimestres sur urssaf.fr."
            selected={value === "auto_entrepreneur"}
            onClick={() => onChange("auto_entrepreneur")}
          />
          <StatusCard
            icon={<Briefcase className="h-5 w-5" />}
            title="EURL"
            desc="Société unipersonnelle à responsabilité limitée. Par défaut à l'IR (option IS possible). Comptabilité réelle."
            selected={value === "eurl"}
            onClick={() => onChange("eurl")}
          />
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Société à l&apos;IS
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon={<Building2 className="h-5 w-5" />}
            title="SASU"
            desc="SAS à associé unique. IS, TVA, bilan, DSN si tu te rémunères. Statut classique pour solopreneur."
            selected={value === "sasu"}
            onClick={() => onChange("sasu")}
          />
          <StatusCard
            icon={<Building2 className="h-5 w-5" />}
            title="SAS"
            desc="Plusieurs associés. Mêmes obligations qu'une SASU. Président toujours assimilé salarié."
            selected={value === "sas"}
            onClick={() => onChange("sas")}
          />
          <StatusCard
            icon={<Building2 className="h-5 w-5" />}
            title="SARL"
            desc="2 à 100 associés. IS par défaut. DSN seulement si gérant minoritaire (assimilé salarié)."
            selected={value === "sarl"}
            onClick={() => onChange("sarl")}
          />
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  desc,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-4 transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={selected ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="font-semibold">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Particulier
 * ────────────────────────────────────────────────────────────────── */

function ParticulierFields({
  value,
  onChange,
  error,
}: {
  value: ParticulierRevenueType | null;
  onChange: (v: ParticulierRevenueType) => void;
  error: string | undefined;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h4 className="font-semibold">Quelle est la nature de tes revenus ?</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Ça détermine la case à remplir sur ta déclaration de revenus
          (formulaire 2042 + 2042-C-PRO).
        </p>
      </div>

      <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as ParticulierRevenueType)}>
        <div className="flex items-start gap-3 py-2">
          <RadioGroupItem value="bnc_accessoire" id="bnc_accessoire" className="mt-1" />
          <Label htmlFor="bnc_accessoire" className="font-normal cursor-pointer">
            <span className="font-medium">Activités libérales accessoires</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Consulting, coaching, formation, prestations intellectuelles…{" "}
              <span className="italic">(régime BNC)</span>
            </span>
          </Label>
        </div>

        <div className="flex items-start gap-3 py-2">
          <RadioGroupItem value="bic_accessoire" id="bic_accessoire" className="mt-1" />
          <Label htmlFor="bic_accessoire" className="font-normal cursor-pointer">
            <span className="font-medium">Vente / services commerciaux accessoires</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Vente de produits, services artisanaux, e-commerce…{" "}
              <span className="italic">(régime BIC)</span>
            </span>
          </Label>
        </div>

        <div className="flex items-start gap-3 py-2">
          <RadioGroupItem value="autre" id="autre" className="mt-1" />
          <Label htmlFor="autre" className="font-normal cursor-pointer">
            <span className="font-medium">Autre</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Revenus de location, droits d&apos;auteur, autre cas particulier.
            </span>
          </Label>
        </div>
      </RadioGroup>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <ExternalLinkRow
        href="https://www.impots.gouv.fr/particulier/professions-non-salariees-revenus-fonciers-pme"
        label="Aide officielle impots.gouv.fr — déclarer des revenus accessoires"
      />
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Auto-entrepreneur
 * ────────────────────────────────────────────────────────────────── */

function AutoEntrepreneurFields({
  draft,
  update,
  errors,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <Card className="p-5 space-y-5">
      {/* Activité */}
      <div className="space-y-2">
        <Label htmlFor="ae-activity">Type d&apos;activité</Label>
        <p className="text-xs text-muted-foreground">
          Détermine les seuils de TVA et les taux URSSAF qui
          s&apos;appliquent à toi.
        </p>
        <Select
          value={draft.ae_activity_type ?? ""}
          onValueChange={(v) => update("ae_activity_type", v as AeActivityType)}
        >
          <SelectTrigger id="ae-activity">
            <SelectValue placeholder="Choisis ton activité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vente">Vente de marchandises</SelectItem>
            <SelectItem value="services_bic">Prestations commerciales / artisanales (BIC)</SelectItem>
            <SelectItem value="services_bnc">Prestations libérales / intellectuelles (BNC)</SelectItem>
            <SelectItem value="mixte">Activité mixte (vente + services)</SelectItem>
          </SelectContent>
        </Select>
        {errors.ae_activity_type ? (
          <p className="text-xs text-destructive">{errors.ae_activity_type}</p>
        ) : null}
      </div>

      {/* Date début */}
      <div className="space-y-2">
        <Label htmlFor="ae-started-at">Date de début d&apos;activité</Label>
        <p className="text-xs text-muted-foreground">
          Date à laquelle tu as immatriculé ta micro-entreprise. Sert à
          calculer le prorata des seuils la 1ʳᵉ année.
        </p>
        <Input
          id="ae-started-at"
          type="date"
          value={draft.ae_started_at ?? ""}
          onChange={(e) => update("ae_started_at", e.target.value || null)}
          max={new Date().toISOString().slice(0, 10)}
        />
        {errors.ae_started_at ? (
          <p className="text-xs text-destructive">{errors.ae_started_at}</p>
        ) : null}
      </div>

      {/* ACRE */}
      <BoolRow
        id="ae-acre"
        title="Tu bénéficies de l'ACRE ?"
        desc="L'ACRE = exonération partielle de tes cotisations URSSAF la 1ʳᵉ année (taux réduit). Seulement si tu l'as demandée et acceptée à l'inscription."
        helpHref="https://www.urssaf.fr/accueil/independant/cotisations/exonerations/acre.html"
        helpLabel="C'est quoi l'ACRE ?"
        checked={!!draft.ae_acre}
        onChange={(b) => update("ae_acre", b)}
      />

      {/* Versement libératoire */}
      <BoolRow
        id="ae-vl"
        title="Tu as opté pour le versement libératoire ?"
        desc="Tu paies ton impôt sur le revenu en même temps que tes cotisations (1 % à 2,2 % du CA selon activité), au lieu de la déclaration annuelle classique."
        helpHref="https://www.service-public.fr/particuliers/vosdroits/F23267"
        helpLabel="C'est quoi le versement libératoire ?"
        checked={!!draft.ae_versement_liberatoire}
        onChange={(b) => update("ae_versement_liberatoire", b)}
      />

      {/* Franchise TVA */}
      <BoolRow
        id="ae-vat-franchise"
        title="Tu es en franchise de TVA ?"
        desc="Par défaut oui pour la majorité des AE en début d'activité. Si tu as dépassé les seuils ou opté pour la TVA volontairement, décoche."
        helpHref="https://www.service-public.fr/professionnels-entreprises/vosdroits/F32353"
        helpLabel="Seuils de la franchise TVA en 2026"
        checked={!!draft.ae_vat_franchise}
        onChange={(b) => update("ae_vat_franchise", b)}
      />

      {/* Régime TVA — conditionnel : seulement si l'user a dépassé
          la franchise. Détermine la périodicité des CA3 dans le
          calendrier fiscal. Défaut simplifié = le plus courant
          quand on bascule depuis la franchise. */}
      {!draft.ae_vat_franchise ? (
        <div className="space-y-1.5 pt-3 border-t">
          <label className="text-sm font-medium block">
            Quel régime TVA ?
          </label>
          <p className="text-xs text-muted-foreground">
            Tu n&apos;es plus en franchise → tu déposes des déclarations
            de TVA. Le régime simplifié (CA12 annuelle + 2 acomptes)
            est le plus courant pour les AE qui sortent de franchise.
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "simplifie", label: "Simplifié", hint: "CA12 annuelle + 2 acomptes" },
                { v: "reel_trimestriel", label: "Réel trimestriel", hint: "CA3 chaque trimestre" },
                { v: "reel_mensuel", label: "Réel mensuel", hint: "CA3 chaque mois" },
              ] as const
            ).map((opt) => {
              const active = (draft.ae_vat_regime ?? "simplifie") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("ae_vat_regime", opt.v)}
                  className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                    active
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    {opt.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Périodicité URSSAF — détermine les dates butoir affichées
          dans le calendrier fiscal (1i). Trimestrielle = défaut. */}
      <div className="space-y-1.5 pt-3 border-t">
        <label className="text-sm font-medium block">
          Tu déclares ton CA à l&apos;URSSAF…
        </label>
        <p className="text-xs text-muted-foreground">
          Choisi à ton inscription URSSAF (modifiable une fois par an).
          Détermine les dates butoir affichées dans ton calendrier fiscal.
        </p>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { v: "trimestrielle", label: "Tous les trimestres", hint: "le plus courant" },
              { v: "mensuelle", label: "Tous les mois", hint: "" },
            ] as const
          ).map((opt) => {
            const active = (draft.ae_urssaf_periodicity ?? "trimestrielle") === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => update("ae_urssaf_periodicity", opt.v)}
                className={`text-sm rounded-md border px-3 py-2 transition ${
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                {opt.label}
                {opt.hint ? (
                  <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                    ({opt.hint})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * SASU
 * ────────────────────────────────────────────────────────────────── */

function SasuFields({
  draft,
  update,
  errors,
  status,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
  /** Statut courant : sasu / sas / sarl / eurl. Affecte le label
   *  "SIREN de ta SASU" + l'affichage des champs spécifiques EURL
   *  (option IS) et SARL (gérant majoritaire). */
  status: "sasu" | "sas" | "sarl" | "eurl";
}) {
  const isEurlIR = status === "eurl" && !draft.eurl_is_election;
  const isAtIS =
    status === "sasu" ||
    status === "sas" ||
    status === "sarl" ||
    (status === "eurl" && draft.eurl_is_election);

  // Label adapté pour le SIREN selon la forme juridique.
  const sirenLabel = (() => {
    switch (status) {
      case "sasu":
        return "SIREN de ta SASU";
      case "sas":
        return "SIREN de ta SAS";
      case "sarl":
        return "SIREN de ta SARL";
      case "eurl":
        return "SIREN de ton EURL";
    }
  })();

  return (
    <Card className="p-5 space-y-5">
      {/* Spécificité EURL : option IS — affiché en premier car ça
          change la nature des autres champs (TVA notamment). */}
      {status === "eurl" ? (
        <div className="space-y-2">
          <Label>Régime fiscal de ton EURL</Label>
          <p className="text-xs text-muted-foreground">
            Par défaut une EURL est à l&apos;IR (le bénéfice est
            ajouté à ta déclaration personnelle via 2031/2035).
            Tu peux opter pour l&apos;IS si tu préfères payer
            l&apos;impôt au niveau de la société.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update("eurl_is_election", false)}
              className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                !draft.eurl_is_election
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div>IR (par défaut)</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Liasse 2031/2035 + 2042 perso
              </div>
            </button>
            <button
              type="button"
              onClick={() => update("eurl_is_election", true)}
              className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                draft.eurl_is_election
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div>IS (sur option)</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Comme une SASU
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {/* Spécificité SARL : gérant majoritaire vs minoritaire */}
      {status === "sarl" ? (
        <div className="space-y-2">
          <Label>Tu es gérant majoritaire ?</Label>
          <p className="text-xs text-muted-foreground">
            Gérant majoritaire (&gt; 50% des parts) = TNS,
            cotisations URSSAF séparées, pas de DSN. Minoritaire
            ou égalitaire = assimilé salarié, DSN obligatoire si
            rémunéré.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update("sarl_gerant_majoritaire", true)}
              className={`text-sm rounded-md border px-3 py-2 ${
                draft.sarl_gerant_majoritaire
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Majoritaire (TNS)
            </button>
            <button
              type="button"
              onClick={() => update("sarl_gerant_majoritaire", false)}
              className={`text-sm rounded-md border px-3 py-2 ${
                !draft.sarl_gerant_majoritaire
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Minoritaire / égalitaire
            </button>
          </div>
        </div>
      ) : null}

      {isEurlIR ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <strong>Mode EURL à l&apos;IR :</strong> ta liasse fiscale
          (2031 ou 2035 selon ton activité) doit être télétransmise
          au plus tard début mai chaque année. Le bénéfice est
          ensuite reporté dans ta 2042 personnelle. Pas d&apos;IS
          ni de DSN dans ce cas.
        </div>
      ) : null}

      {/* SIREN — commun à toutes les formes société */}
      <div className="space-y-2">
        <Label htmlFor="sasu-siren">{sirenLabel}</Label>
        <p className="text-xs text-muted-foreground">
          9 chiffres. Tu le trouves sur ton extrait Kbis ou sur{" "}
          <a
            href="https://annuaire-entreprises.data.gouv.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            annuaire-entreprises.data.gouv.fr
          </a>
          .
        </p>
        <Input
          id="sasu-siren"
          inputMode="numeric"
          maxLength={9}
          placeholder="123456789"
          value={draft.sasu_siren ?? ""}
          onChange={(e) => {
            // ne garde que les chiffres
            const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
            update("sasu_siren", digits || null);
          }}
          className="font-mono tracking-wider"
        />
        {errors.sasu_siren ? (
          <p className="text-xs text-destructive">{errors.sasu_siren}</p>
        ) : null}
      </div>

      {/* Exercice fiscal */}
      <div className="space-y-2">
        <Label>Exercice fiscal</Label>
        <p className="text-xs text-muted-foreground">
          La majorité des SASU clôture au 31 décembre. Si ta clôture
          tombe à un autre mois, indique-le ci-dessous.
        </p>

        <div className="flex items-center gap-3 py-1">
          <Switch
            id="sasu-fy-calendar"
            checked={!!draft.sasu_fiscal_year_calendar}
            onCheckedChange={(b) => {
              update("sasu_fiscal_year_calendar", b);
              if (b) update("sasu_fiscal_year_start_month", null);
            }}
          />
          <Label htmlFor="sasu-fy-calendar" className="font-normal cursor-pointer">
            Mon exercice = année civile (1ᵉʳ janvier → 31 décembre)
          </Label>
        </div>

        {!draft.sasu_fiscal_year_calendar ? (
          <div className="space-y-1 pl-1">
            <Label htmlFor="sasu-fy-start" className="text-xs">
              Mois de début d&apos;exercice
            </Label>
            <Select
              value={draft.sasu_fiscal_year_start_month?.toString() ?? ""}
              onValueChange={(v) => update("sasu_fiscal_year_start_month", parseInt(v, 10))}
            >
              <SelectTrigger id="sasu-fy-start" className="w-[200px]">
                <SelectValue placeholder="Choisis le mois" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
                ].map((label, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.sasu_fiscal_year_start_month ? (
              <p className="text-xs text-destructive">{errors.sasu_fiscal_year_start_month}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Régime TVA */}
      <div className="space-y-2">
        <Label htmlFor="sasu-vat-regime">Régime de TVA</Label>
        <p className="text-xs text-muted-foreground">
          Tu trouves cette info sur ton avis de situation fiscale ou
          sur impots.gouv.fr → Espace pro → Démarches → Consulter.
        </p>
        <Select
          value={draft.sasu_vat_regime ?? ""}
          onValueChange={(v) => update("sasu_vat_regime", v as SasuVatRegime)}
        >
          <SelectTrigger id="sasu-vat-regime">
            <SelectValue placeholder="Choisis ton régime" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reel_mensuel">Réel normal mensuel (CA3 chaque mois)</SelectItem>
            <SelectItem value="reel_trimestriel">Réel normal trimestriel (CA3 chaque trimestre)</SelectItem>
            <SelectItem value="simplifie">Simplifié (CA12 annuelle + 2 acomptes)</SelectItem>
          </SelectContent>
        </Select>
        {errors.sasu_vat_regime ? (
          <p className="text-xs text-destructive">{errors.sasu_vat_regime}</p>
        ) : null}
        <ExternalLinkRow
          href="https://www.impots.gouv.fr/professionnel/declaration-de-tva"
          label="Comment déclarer ma TVA ?"
        />
      </div>

      {/* TVA intra */}
      <BoolRow
        id="sasu-vat-intra"
        title="Tu factures des clients dans l'Union européenne (hors France) ?"
        desc="Si oui, tu dois faire une DES (Déclaration européenne des services) chaque mois où tu as facturé un client UE. Active cette option pour que Tipote te le rappelle."
        helpHref="https://www.douane.gouv.fr/des-prestations-de-services"
        helpLabel="Tout sur la DES"
        checked={!!draft.sasu_vat_intra_enabled}
        onChange={(b) => update("sasu_vat_intra_enabled", b)}
      />

      {/* Dirigeant rémunéré */}
      <BoolRow
        id="sasu-dirigeant-remunere"
        title="Tu te verses une rémunération comme dirigeant ?"
        desc="Si oui, tu cotises à l'URSSAF (régime assimilé salarié) et tu déposes une DSN. Si tu te rémunères uniquement en dividendes, décoche."
        helpHref="https://www.service-public.fr/professionnels-entreprises/vosdroits/F31198"
        helpLabel="Statut social du président de SASU"
        checked={!!draft.sasu_dirigeant_remunere}
        onChange={(b) => update("sasu_dirigeant_remunere", b)}
      />
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Composants utilitaires
 * ────────────────────────────────────────────────────────────────── */

function BoolRow({
  id,
  title,
  desc,
  helpHref,
  helpLabel,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  desc: string;
  helpHref: string;
  helpLabel: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
        <Label htmlFor={id} className="font-medium cursor-pointer leading-tight">
          {title}
        </Label>
      </div>
      <p className="text-xs text-muted-foreground pl-[3.25rem]">{desc}</p>
      <div className="pl-[3.25rem]">
        <ExternalLinkRow href={helpHref} label={helpLabel} />
      </div>
    </div>
  );
}

function ExternalLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 underline"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}
