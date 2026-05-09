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
import { CH_CANTONS_ORDERED } from "@/lib/compta/ch_cantons";
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
  /** Pays détecté côté parent (FR / CH / PT) — détermine quelles
   *  cartes de statut on propose (6 FR, 4 CH, 6 PT). */
  country: "FR" | "CH" | "PT";
  /** Si fourni, l'user édite une config existante → bouton "Annuler". */
  onCancel?: () => void;
  /** Patch à envoyer à /api/profile. Le parent gère le fetch + le toast. */
  onSave: (patch: Partial<ComptaProfileSlice>) => Promise<void>;
  pending: boolean;
}

export default function ComptaConfigForm({
  initial,
  country,
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
    } else if (
      status === "independant_ch" ||
      status === "sarl_ch" ||
      status === "sa_ch"
    ) {
      // Statuts CH — validations pragmatiques.
      // Canton recommandé mais pas bloquant (l'user peut compléter
      // plus tard ; le calendrier tombe sur les dates fédérales par
      // défaut sinon). En revanche si l'user a coché "assujetti TVA",
      // il doit choisir une périodicité.
      if (draft.ch_vat_assujetti && !draft.ch_vat_periodicity) {
        next.ch_vat_periodicity = "Choisis la périodicité de tes décomptes TVA.";
      }
    } else if (
      status === "trabalhador_independente_pt" ||
      status === "eni_pt" ||
      status === "lda_unipessoal_pt" ||
      status === "lda_pt" ||
      status === "sa_pt"
    ) {
      // PT : NIF format 9 chiffres si renseigné.
      if (draft.pt_nif && !/^\d{9}$/.test(draft.pt_nif)) {
        next.pt_nif = "NIF invalide (9 chiffres exactement).";
      }
      // Si non-isento, périodicité IVA obligatoire.
      if (!draft.pt_iva_isento && !draft.pt_iva_periodicity) {
        next.pt_iva_periodicity = "Choisis la périodicité de tes déclarations IVA.";
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
    } else if (
      status === "independant_ch" ||
      status === "sarl_ch" ||
      status === "sa_ch"
    ) {
      // Statuts CH — on stocke les colonnes ch_*. Pour Sàrl/SA on
      // réutilise aussi les colonnes sasu_fiscal_year_* pour la
      // clôture de l'exercice (l'écrasante majorité des Sàrl CH
      // clôturent au 31/12 mais on laisse l'option ouverte).
      patch.ch_canton = draft.ch_canton;
      patch.ch_vat_assujetti = draft.ch_vat_assujetti;
      patch.ch_vat_periodicity = draft.ch_vat_assujetti
        ? draft.ch_vat_periodicity ?? "trimestrielle"
        : null;
      patch.ch_vat_method = draft.ch_vat_assujetti
        ? draft.ch_vat_method ?? "effective"
        : null;
      patch.ch_started_at = draft.ch_started_at;
      if (status === "sarl_ch" || status === "sa_ch") {
        patch.sasu_fiscal_year_calendar = draft.sasu_fiscal_year_calendar;
        patch.sasu_fiscal_year_start_month = draft.sasu_fiscal_year_calendar
          ? null
          : draft.sasu_fiscal_year_start_month;
      }
    } else if (
      status === "trabalhador_independente_pt" ||
      status === "eni_pt" ||
      status === "lda_unipessoal_pt" ||
      status === "lda_pt" ||
      status === "sa_pt"
    ) {
      // Statuts PT — colonnes pt_*. Pour LDA/SA, on réutilise
      // aussi sasu_fiscal_year_* pour l'exercice comptable.
      patch.pt_nif = draft.pt_nif;
      patch.pt_region = draft.pt_region ?? "continente";
      patch.pt_iva_isento = draft.pt_iva_isento;
      patch.pt_iva_periodicity = draft.pt_iva_isento
        ? null
        : draft.pt_iva_periodicity ?? "trimestral";
      // Régime fiscal seulement pour les indépendants/ENI
      if (status === "trabalhador_independente_pt" || status === "eni_pt") {
        patch.pt_tax_regime = draft.pt_tax_regime ?? "simplificado";
      }
      patch.pt_started_at = draft.pt_started_at;
      if (
        status === "lda_unipessoal_pt" ||
        status === "lda_pt" ||
        status === "sa_pt"
      ) {
        patch.sasu_fiscal_year_calendar = draft.sasu_fiscal_year_calendar;
        patch.sasu_fiscal_year_start_month = draft.sasu_fiscal_year_calendar
          ? null
          : draft.sasu_fiscal_year_start_month;
      }
    }

    await onSave(patch);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StatusPicker
        value={status}
        country={country}
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

      {status === "independant_ch" ||
      status === "sarl_ch" ||
      status === "sa_ch" ? (
        <SuisseFields draft={draft} update={update} errors={errors} status={status} />
      ) : null}

      {status === "trabalhador_independente_pt" ||
      status === "eni_pt" ||
      status === "lda_unipessoal_pt" ||
      status === "lda_pt" ||
      status === "sa_pt" ? (
        <PortugalFields draft={draft} update={update} errors={errors} status={status} />
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
  country,
  onChange,
}: {
  value: AccountingStatus | null;
  country: "FR" | "CH" | "PT";
  onChange: (v: AccountingStatus) => void;
}) {
  // Rend des cartes différentes selon le pays détecté côté parent.
  // FR : 6 statuts (particulier / AE / EURL / SASU / SAS / SARL).
  // CH : 4 statuts (particulier / Indépendant / Sàrl / SA).
  // L'user pige direct ce qui le concerne (sa carte est colorée).

  if (country === "CH") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">Quel est ton statut ?</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Sans société dédiée
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title="Particulier"
              desc="Revenus accessoires (en plus d'un emploi ou pas d'autre activité). Tout passe par ta déclaration d'impôt cantonale + fédérale annuelle."
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Indépendant (raison individuelle)"
              desc="Tu exerces sous ton propre nom (Einzelfirma). AVS trimestrielle, TVA si CA > 100'000 CHF, déclaration d'impôt personnelle."
              selected={value === "independant_ch"}
              onClick={() => onChange("independant_ch")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Société commerciale
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="Sàrl"
              desc="Société à responsabilité limitée. Comptes annuels, IBO (impôt sur le bénéfice), TVA si > 100'000 CHF."
              selected={value === "sarl_ch"}
              onClick={() => onChange("sarl_ch")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SA"
              desc="Société anonyme. Capital min. CHF 100'000. Mêmes obligations comptables qu'une Sàrl, structure plus formelle."
              selected={value === "sa_ch"}
              onClick={() => onChange("sa_ch")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Les particularités cantonales (taux IBO, AVS, allocations
          familiales) varient selon les 26 cantons. Tipote affiche
          le calendrier fédéral + les dates butoir de déclaration
          de TON canton (à indiquer plus bas). Pour les taux exacts
          d&apos;imposition, ton fiduciaire reste la référence.
        </p>
      </div>
    );
  }

  if (country === "PT") {
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
              desc="Revenus accessoires (en plus d'un emploi ou pas d'autre activité). Tout passe par ta Modelo 3 IRS annuelle."
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Trabalhador independente"
              desc="Indépendant inscrit à l'AT (Recibos Verdes). Régime simplificado par défaut, IVA si CA > 15k €, Segurança Social mensuelle."
              selected={value === "trabalhador_independente_pt"}
              onClick={() => onChange("trabalhador_independente_pt")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="ENI"
              desc="Empresário em Nome Individual. Activité commerciale sous ton nom, comptabilité organizada possible."
              selected={value === "eni_pt"}
              onClick={() => onChange("eni_pt")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Société commerciale (à l&apos;IRC)
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="LDA Unipessoal"
              desc="Sociedade Unipessoal por Quotas — un seul associé. IRC 21%, comptes annuels, Modelo 22, e-fatura."
              selected={value === "lda_unipessoal_pt"}
              onClick={() => onChange("lda_unipessoal_pt")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="LDA"
              desc="Sociedade por Quotas — 2 associés ou plus. Mêmes obligations qu'une LDA Unipessoal."
              selected={value === "lda_pt"}
              onClick={() => onChange("lda_pt")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SA"
              desc="Sociedade Anónima. Capital min. 50 000 €, structure plus formelle. Mêmes obligations IRC qu'une LDA."
              selected={value === "sa_pt"}
              onClick={() => onChange("sa_pt")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Tipote couvre les obligations fédérales portugaises
          (IVA, IRS, IRC, Modelo 22, Segurança Social, e-fatura).
          Les particularités régionales (Madère / Açores ont des
          taux IVA différents) sont gérées via le sélecteur région
          plus bas. Pour les calculs exacts d&apos;impôt, ton
          contabilista certificado reste la référence.
        </p>
      </div>
    );
  }

  // FR (défaut)
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
 * Suisse (phase 1n)
 * ────────────────────────────────────────────────────────────────── */

function SuisseFields({
  draft,
  update,
  errors,
  status,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
  status: "independant_ch" | "sarl_ch" | "sa_ch";
}) {
  const isCorporate = status === "sarl_ch" || status === "sa_ch";

  return (
    <Card className="p-5 space-y-5">
      {/* Disclaimer cantonal — Tipote couvre les 26 cantons sur les
          dates butoir et le portail, mais pas les taux d'imposition. */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Important Suisse :</strong> Tipote calcule tes
        échéances en fonction de ton canton (date butoir de
        déclaration d&apos;impôt + portail). Les taux d&apos;imposition
        (IBO, IRPP) varient selon les 26 cantons et leurs communes —
        ton fiduciaire reste la référence pour les calculs exacts.
      </div>

      {/* Canton — sélecteur des 26 valeurs ISO 3166-2 CH-XX */}
      <div className="space-y-2">
        <Label htmlFor="ch-canton">Ton canton</Label>
        <p className="text-xs text-muted-foreground">
          Détermine la date butoir de ta déclaration d&apos;impôt et
          le portail vers lequel on te dirige.
        </p>
        <select
          id="ch-canton"
          value={draft.ch_canton ?? ""}
          onChange={(e) => update("ch_canton", e.target.value || null)}
          className="w-full h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">— Choisis ton canton —</option>
          {CH_CANTONS_ORDERED.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date de début d'activité (optionnel) */}
      <div className="space-y-2">
        <Label htmlFor="ch-started">
          Date de début d&apos;activité{" "}
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <input
          id="ch-started"
          type="date"
          value={draft.ch_started_at ?? ""}
          onChange={(e) => update("ch_started_at", e.target.value || null)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* SIREN-équivalent CH = numéro IDE (CHE-XXX.XXX.XXX). On
          réutilise sasu_siren pour stocker l'IDE des Sàrl/SA — la
          colonne est TEXT, pas de problème. Validation côté zod
          reste sur le pattern \d{9} pour FR ; côté CH on accepte
          des formats plus libres. Pour MVP : on demande l'IDE
          mais on ne le valide pas strictement. */}
      {isCorporate ? (
        <div className="space-y-2">
          <Label htmlFor="ch-ide">
            Numéro IDE (Numéro d&apos;identification d&apos;entreprise)
          </Label>
          <p className="text-xs text-muted-foreground">
            Format CHE-XXX.XXX.XXX. Tu le trouves sur ton extrait du
            registre du commerce ou sur{" "}
            <a
              href="https://www.uid.admin.ch/Search.aspx?lang=fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              uid.admin.ch
            </a>
            .
          </p>
          <Input
            id="ch-ide"
            value={draft.sasu_siren ?? ""}
            onChange={(e) => update("sasu_siren", e.target.value || null)}
            placeholder="CHE-123.456.789"
          />
        </div>
      ) : null}

      {/* Exercice fiscal — pour Sàrl/SA. Réutilise les colonnes
          sasu_fiscal_year_*. */}
      {isCorporate ? (
        <div className="space-y-2">
          <Label>Exercice comptable</Label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update("sasu_fiscal_year_calendar", true)}
              className={`text-sm rounded-md border px-3 py-2 ${
                draft.sasu_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Année civile (jan → déc)
            </button>
            <button
              type="button"
              onClick={() => update("sasu_fiscal_year_calendar", false)}
              className={`text-sm rounded-md border px-3 py-2 ${
                !draft.sasu_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Décalé
            </button>
          </div>
          {!draft.sasu_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">Mois de début d&apos;exercice</Label>
              <select
                value={draft.sasu_fiscal_year_start_month ?? ""}
                onChange={(e) =>
                  update("sasu_fiscal_year_start_month", parseInt(e.target.value, 10) || null)
                }
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Assujettissement TVA — seuil unique CHF 100'000/an */}
      <BoolRow
        id="ch-vat-assujetti"
        title="Assujetti à la TVA suisse ?"
        desc="L'assujettissement devient obligatoire dès que ton CA mondial dépasse CHF 100'000 / an. En dessous, tu peux rester non-assujetti (ou opter volontairement)."
        helpHref="https://www.estv.admin.ch/estv/fr/accueil/tva.html"
        helpLabel="Seuils TVA suisses"
        checked={!!draft.ch_vat_assujetti}
        onChange={(b) => update("ch_vat_assujetti", b)}
      />

      {/* Périodicité TVA + méthode (visibles seulement si assujetti) */}
      {draft.ch_vat_assujetti ? (
        <>
          <div className="space-y-2 pt-3 border-t">
            <Label>Périodicité du décompte TVA</Label>
            <p className="text-xs text-muted-foreground">
              Détermine les dates butoir de tes décomptes (T1→31 mai,
              T2→31 août, T3→30 nov, T4→28 fév pour le trimestriel).
            </p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { v: "trimestrielle", label: "Trimestrielle", hint: "défaut" },
                  { v: "mensuelle", label: "Mensuelle", hint: "rare" },
                  { v: "semestrielle", label: "Semestrielle", hint: "TDFN" },
                  { v: "annuelle", label: "Annuelle", hint: "petits CA" },
                ] as const
              ).map((opt) => {
                const active = (draft.ch_vat_periodicity ?? "trimestrielle") === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => update("ch_vat_periodicity", opt.v)}
                    className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                      active
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div>{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      ({opt.hint})
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.ch_vat_periodicity ? (
              <p className="text-xs text-destructive">{errors.ch_vat_periodicity}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Méthode de décompte</Label>
            <p className="text-xs text-muted-foreground">
              Effective = TVA déductible classique (chaque facture
              fournisseur). TDFN = Taux de la Dette Fiscale Nette =
              taux forfaitaire selon ta branche d&apos;activité (plus
              simple, mais souvent moins avantageux).
            </p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { v: "effective", label: "Effective", hint: "défaut" },
                  { v: "tdfn", label: "TDFN", hint: "forfaitaire par branche" },
                ] as const
              ).map((opt) => {
                const active = (draft.ch_vat_method ?? "effective") === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => update("ch_vat_method", opt.v)}
                    className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                      active
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div>{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      ({opt.hint})
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function monthName(m: number): string {
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return months[m - 1] ?? "";
}

/* ──────────────────────────────────────────────────────────────────
 * Portugal (phase 1o)
 * ────────────────────────────────────────────────────────────────── */

function PortugalFields({
  draft,
  update,
  errors,
  status,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
  status:
    | "trabalhador_independente_pt"
    | "eni_pt"
    | "lda_unipessoal_pt"
    | "lda_pt"
    | "sa_pt";
}) {
  const isCorporate =
    status === "lda_unipessoal_pt" ||
    status === "lda_pt" ||
    status === "sa_pt";
  const isIndepOrEni =
    status === "trabalhador_independente_pt" || status === "eni_pt";

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Portugal :</strong> Tipote calcule tes échéances IVA,
        IRS / IRC et Segurança Social à partir des dates butoir
        officielles de l&apos;AT (Autoridade Tributária). Les taux
        d&apos;impôt et la derrama municipal varient — ton
        contabilista certificado reste la référence pour les calculs.
      </div>

      {/* NIF — 9 chiffres, géré par l'AT */}
      <div className="space-y-2">
        <Label htmlFor="pt-nif">NIF (Número de Identificação Fiscal)</Label>
        <p className="text-xs text-muted-foreground">
          9 chiffres. Tu peux le retrouver sur le portail{" "}
          <a
            href="https://www.portaldasfinancas.gov.pt/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            portaldasfinancas.gov.pt
          </a>
          .
        </p>
        <Input
          id="pt-nif"
          inputMode="numeric"
          maxLength={9}
          value={draft.pt_nif ?? ""}
          onChange={(e) => update("pt_nif", e.target.value.replace(/\D/g, "") || null)}
          placeholder="123456789"
        />
        {errors.pt_nif ? (
          <p className="text-xs text-destructive">{errors.pt_nif}</p>
        ) : null}
      </div>

      {/* Région : continent / Madère / Açores — affecte les taux IVA */}
      <div className="space-y-2">
        <Label>Ta région</Label>
        <p className="text-xs text-muted-foreground">
          Madère et Açores ont des taux IVA réduits par rapport au
          continent (22% et 16% au lieu de 23% pour le taux normal).
        </p>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { v: "continente", label: "Portugal continental", hint: "23% / 13% / 6%" },
              { v: "madeira", label: "Madeira", hint: "22% / 12% / 5%" },
              { v: "acores", label: "Açores", hint: "16% / 9% / 4%" },
            ] as const
          ).map((opt) => {
            const active = (draft.pt_region ?? "continente") === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => update("pt_region", opt.v)}
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

      {/* Date début activité */}
      <div className="space-y-2">
        <Label htmlFor="pt-started">
          Date de début d&apos;activité{" "}
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <input
          id="pt-started"
          type="date"
          value={draft.pt_started_at ?? ""}
          onChange={(e) => update("pt_started_at", e.target.value || null)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Régime fiscal — uniquement pour indépendants/ENI */}
      {isIndepOrEni ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Régime fiscal</Label>
          <p className="text-xs text-muted-foreground">
            Régime simplificado : forfait sur 75% du CA, comptabilité
            allégée. Contabilidade organizada : comptabilité réelle,
            obligatoire au-dessus de 200 000 € de CA.
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "simplificado", label: "Simplificado", hint: "défaut" },
                { v: "organizada", label: "Contabilidade organizada", hint: "comptabilité réelle" },
              ] as const
            ).map((opt) => {
              const active = (draft.pt_tax_regime ?? "simplificado") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("pt_tax_regime", opt.v)}
                  className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                    active
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    ({opt.hint})
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Exercice comptable pour LDA/SA */}
      {isCorporate ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Exercice comptable</Label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update("sasu_fiscal_year_calendar", true)}
              className={`text-sm rounded-md border px-3 py-2 ${
                draft.sasu_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Année civile (jan → déc)
            </button>
            <button
              type="button"
              onClick={() => update("sasu_fiscal_year_calendar", false)}
              className={`text-sm rounded-md border px-3 py-2 ${
                !draft.sasu_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Décalé
            </button>
          </div>
          {!draft.sasu_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">Mois de début d&apos;exercice</Label>
              <select
                value={draft.sasu_fiscal_year_start_month ?? ""}
                onChange={(e) =>
                  update("sasu_fiscal_year_start_month", parseInt(e.target.value, 10) || null)
                }
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Régime IVA — assujetti ou isento */}
      <BoolRow
        id="pt-iva-isento"
        title="Régime de isenção IVA ?"
        desc="Si tu es sous le seuil de 15 000 € de CA annuel (art. 53 CIVA), tu es exonéré et tu ne factures pas la TVA. Au-dessus, tu collectes l'IVA et déclares mensuellement / trimestriellement."
        helpHref="https://info-ras.at.gov.pt/"
        helpLabel="Plus d'infos sur le régime de isenção"
        checked={!!draft.pt_iva_isento}
        onChange={(b) => update("pt_iva_isento", b)}
      />

      {/* Périodicité IVA si non-isento */}
      {!draft.pt_iva_isento ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Périodicité du décompte IVA</Label>
          <p className="text-xs text-muted-foreground">
            Trimestrielle si CA &lt; 650 000 € (cas le plus courant).
            Mensuelle au-delà. Date butoir : jour 25 du 2e mois suivant
            la période.
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "trimestral", label: "Trimestrielle", hint: "défaut, CA < 650k €" },
                { v: "mensal", label: "Mensuelle", hint: "CA > 650k €" },
              ] as const
            ).map((opt) => {
              const active = (draft.pt_iva_periodicity ?? "trimestral") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("pt_iva_periodicity", opt.v)}
                  className={`text-sm rounded-md border px-3 py-2 transition text-left ${
                    active
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    ({opt.hint})
                  </div>
                </button>
              );
            })}
          </div>
          {errors.pt_iva_periodicity ? (
            <p className="text-xs text-destructive">{errors.pt_iva_periodicity}</p>
          ) : null}
        </div>
      ) : null}
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
