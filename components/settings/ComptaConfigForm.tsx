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
  type EsCommunity,
  type EsIvaRegime,
  type EsIvaPeriodicity,
  type EsIrpfMethod,
  ES_COMMUNITIES,
  isCanariasCommunity,
  isIPSICommunity,
  isForalCommunity,
  type CaProvince,
  type CaGstPeriodicity,
  CA_PROVINCES,
  caTaxRegime,
  emptyComptaSlice,
  SIREN_REGEX,
} from "@/lib/compta/types";

interface Props {
  initial: ComptaProfileSlice;
  /** Pays détecté côté parent (FR / CH / PT / BE / ES / CA) — détermine
   *  quelles cartes de statut on propose. */
  country: "FR" | "CH" | "PT" | "BE" | "ES" | "CA";
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
      if (draft.pt_nif && !/^\d{9}$/.test(draft.pt_nif)) {
        next.pt_nif = "NIF invalide (9 chiffres exactement).";
      }
      if (!draft.pt_iva_isento && !draft.pt_iva_periodicity) {
        next.pt_iva_periodicity = "Choisis la périodicité de tes déclarations IVA.";
      }
    } else if (
      status === "independant_principal_be" ||
      status === "independant_complementaire_be" ||
      status === "srl_be" ||
      status === "sa_be"
    ) {
      if (draft.be_company_number && !/^\d{10}$/.test(draft.be_company_number)) {
        next.be_company_number = "Numéro BCE invalide (10 chiffres exactement).";
      }
      if (!draft.be_vat_franchise && !draft.be_vat_periodicity) {
        next.be_vat_periodicity = "Choisis la périodicité de tes déclarations TVA.";
      }
    } else if (
      status === "autonomo_es" ||
      status === "slu_es" ||
      status === "sl_es" ||
      status === "sa_es"
    ) {
      if (!draft.es_community) {
        next.es_community = "Choisis ta Comunidad Autónoma.";
      }
      if (!draft.es_iva_regime && !isIPSICommunity(draft.es_community)) {
        next.es_iva_regime = "Choisis ton régime IVA.";
      }
      if (
        draft.es_iva_regime &&
        draft.es_iva_regime !== "exencion" &&
        !isIPSICommunity(draft.es_community) &&
        !draft.es_iva_periodicity
      ) {
        next.es_iva_periodicity = "Choisis la périodicité de tes déclarations.";
      }
      if (status === "autonomo_es" && !draft.es_irpf_method) {
        next.es_irpf_method = "Choisis ta méthode IRPF.";
      }
    } else if (
      status === "travailleur_autonome_ca" ||
      status === "entreprise_individuelle_ca" ||
      status === "inc_provincial_ca" ||
      status === "inc_federal_ca"
    ) {
      if (!draft.ca_province) {
        next.ca_province = "Choisis ta province / ton territoire.";
      }
      // Inscrit à la TPS → périodicité requise.
      if (draft.ca_gst_registered && !draft.ca_gst_periodicity) {
        next.ca_gst_periodicity = "Choisis la périodicité de tes déclarations TPS.";
      }
      // Société → exercice cohérent.
      if (
        (status === "inc_provincial_ca" || status === "inc_federal_ca") &&
        !draft.ca_fiscal_year_calendar &&
        !draft.ca_fiscal_year_start_month
      ) {
        next.ca_fiscal_year_start_month = "Indique le mois de début d'exercice.";
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
      patch.pt_nif = draft.pt_nif;
      patch.pt_region = draft.pt_region ?? "continente";
      patch.pt_iva_isento = draft.pt_iva_isento;
      patch.pt_iva_periodicity = draft.pt_iva_isento
        ? null
        : draft.pt_iva_periodicity ?? "trimestral";
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
    } else if (
      status === "independant_principal_be" ||
      status === "independant_complementaire_be" ||
      status === "srl_be" ||
      status === "sa_be"
    ) {
      patch.be_region = draft.be_region;
      patch.be_company_number = draft.be_company_number;
      patch.be_vat_franchise = draft.be_vat_franchise;
      patch.be_vat_periodicity = draft.be_vat_franchise
        ? null
        : draft.be_vat_periodicity ?? "trimestrielle";
      patch.be_intra_eu_listing = draft.be_intra_eu_listing;
      patch.be_started_at = draft.be_started_at;
      if (status === "srl_be" || status === "sa_be") {
        patch.sasu_fiscal_year_calendar = draft.sasu_fiscal_year_calendar;
        patch.sasu_fiscal_year_start_month = draft.sasu_fiscal_year_calendar
          ? null
          : draft.sasu_fiscal_year_start_month;
      }
    } else if (
      status === "autonomo_es" ||
      status === "slu_es" ||
      status === "sl_es" ||
      status === "sa_es"
    ) {
      patch.es_community = draft.es_community;
      patch.es_company_number = draft.es_company_number;
      // Ceuta/Melilla = IPSI, on stocke 'exencion' pour neutraliser
      // le calendrier IVA. Sinon on garde le régime choisi.
      patch.es_iva_regime = isIPSICommunity(draft.es_community)
        ? "exencion"
        : draft.es_iva_regime;
      patch.es_iva_periodicity =
        draft.es_iva_regime === "exencion" || isIPSICommunity(draft.es_community)
          ? null
          : draft.es_iva_periodicity ?? "trimestral";
      patch.es_redeme = draft.es_redeme;
      if (status === "autonomo_es") {
        patch.es_irpf_method = draft.es_irpf_method ?? "directa";
      }
      patch.es_started_at = draft.es_started_at;
      if (status === "slu_es" || status === "sl_es" || status === "sa_es") {
        patch.sasu_fiscal_year_calendar = draft.sasu_fiscal_year_calendar;
        patch.sasu_fiscal_year_start_month = draft.sasu_fiscal_year_calendar
          ? null
          : draft.sasu_fiscal_year_start_month;
      }
    } else if (
      status === "travailleur_autonome_ca" ||
      status === "entreprise_individuelle_ca" ||
      status === "inc_provincial_ca" ||
      status === "inc_federal_ca"
    ) {
      patch.ca_province = draft.ca_province;
      patch.ca_business_number = draft.ca_business_number;
      patch.ca_gst_registered = draft.ca_gst_registered;
      patch.ca_petit_fournisseur = draft.ca_petit_fournisseur;
      patch.ca_gst_periodicity = draft.ca_gst_registered
        ? draft.ca_gst_periodicity ?? "trimestrielle"
        : null;
      patch.ca_started_at = draft.ca_started_at;
      if (status === "inc_provincial_ca" || status === "inc_federal_ca") {
        patch.ca_fiscal_year_calendar = draft.ca_fiscal_year_calendar;
        patch.ca_fiscal_year_start_month = draft.ca_fiscal_year_calendar
          ? null
          : draft.ca_fiscal_year_start_month;
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

      {status === "independant_principal_be" ||
      status === "independant_complementaire_be" ||
      status === "srl_be" ||
      status === "sa_be" ? (
        <BelgiqueFields draft={draft} update={update} errors={errors} status={status} />
      ) : null}

      {status === "autonomo_es" ||
      status === "slu_es" ||
      status === "sl_es" ||
      status === "sa_es" ? (
        <EspagneFields draft={draft} update={update} errors={errors} status={status} />
      ) : null}

      {status === "travailleur_autonome_ca" ||
      status === "entreprise_individuelle_ca" ||
      status === "inc_provincial_ca" ||
      status === "inc_federal_ca" ? (
        <CanadaFields draft={draft} update={update} errors={errors} status={status} />
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
  country: "FR" | "CH" | "PT" | "BE" | "ES";
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

  if (country === "BE") {
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
              desc="Revenus accessoires (en plus d'un emploi salarié ou pas d'autre activité). Tout passe par ta déclaration IPP via Tax-on-web."
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Indépendant principal"
              desc="Activité indépendante à titre principal (cotisations INASTI/RSVZ pleines à 20,5%). Inscrit à la BCE."
              selected={value === "independant_principal_be"}
              onClick={() => onChange("independant_principal_be")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Indépendant complémentaire"
              desc="Activité indépendante à côté d'un emploi salarié principal. Cotisations sociales réduites."
              selected={value === "independant_complementaire_be"}
              onClick={() => onChange("independant_complementaire_be")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Société commerciale (à l&apos;ISoc)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SRL"
              desc="Société à Responsabilité Limitée (ex-SPRL, réforme 2019). ISoc 25% (ou 20% PME 1re tranche), comptes annuels BNB, Biztax."
              selected={value === "srl_be"}
              onClick={() => onChange("srl_be")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SA"
              desc="Société Anonyme. Capital min. 61 500 €. Mêmes obligations ISoc/comptes annuels qu'une SRL, structure plus formelle."
              selected={value === "sa_be"}
              onClick={() => onChange("sa_be")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Tipote couvre les obligations fédérales belges (TVA via
          Intervat, IPP/ISoc, INASTI, comptes annuels BNB, listings
          client + intra-UE). Les particularités régionales (primes
          PME wallonnes/flamandes/bruxelloises, TVA véhicules) ne
          sont pas détaillées — ton comptable / expert-comptable
          reste la référence.
        </p>
      </div>
    );
  }

  if (country === "ES") {
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
              desc="Revenus accessoires (en plus d'un emploi salarié ou pas d'autre activité). Tout passe par ta déclaration IRPF (Modelo 100) annuelle."
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Autónomo"
              desc="Trabajador autónomo, inscrit au RETA. Cotisations sociales mensuelles via TGSS, IRPF Modelos 130/131 trimestriels, IVA Modelo 303 trimestriel."
              selected={value === "autonomo_es"}
              onClick={() => onChange("autonomo_es")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Société commerciale (Impuesto sobre Sociedades)
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SLU"
              desc="Sociedad Limitada Unipessoal — un seul associé. IS 25% (ou 23% empresas reducidas), comptes annuels Registro Mercantil, Modelo 200."
              selected={value === "slu_es"}
              onClick={() => onChange("slu_es")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SL"
              desc="Sociedad Limitada — 2 associés ou plus. Mêmes obligations IS/comptes annuels qu'une SLU."
              selected={value === "sl_es"}
              onClick={() => onChange("sl_es")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="SA"
              desc="Sociedad Anónima. Capital min. 60 000 €, structure plus formelle. Mêmes obligations IS qu'une SL."
              selected={value === "sa_es"}
              onClick={() => onChange("sa_es")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Tipote couvre les obligations fédérales espagnoles (IVA via
          Modelo 303/390/349, IRPF Modelos 100/130, IS Modelo 200/202,
          RETA mensuel via TGSS, comptes annuels Registro Mercantil).
          Régimen Foral (País Vasco, Navarra) : Hacienda Foral remplace
          AEAT. Canarias : IGIC au lieu d&apos;IVA. Ceuta/Melilla :
          IPSI. Pour les calculs exacts d&apos;impôt et les particularités
          régionales (déductions IRPF par CCAA), ton asesor fiscal reste
          la référence.
        </p>
      </div>
    );
  }

  if (country === "CA") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">Quel est ton statut ?</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Sans société
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title="Particulier"
              desc="Revenus accessoires sans activité d'entreprise structurée. Tout passe par ta T1 (et TP-1 au QC) annuelle."
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Travailleur autonome"
              desc="Sole proprietor non immatriculé (au QC : pas inscrit au REQ). Revenus déclarés sur ta T1 personnelle via T2125. Production 15 juin, paiement 30 avril."
              selected={value === "travailleur_autonome_ca"}
              onClick={() => onChange("travailleur_autonome_ca")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Entreprise individuelle"
              desc="Sole proprietor immatriculé sous un nom commercial (au QC : inscrit au REQ avec NEQ). Mêmes obligations fiscales qu'un travailleur autonome + déclaration annuelle au registre."
              selected={value === "entreprise_individuelle_ca"}
              onClick={() => onChange("entreprise_individuelle_ca")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Société par actions (T2 + impôt provincial)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="Société provinciale (Inc.)"
              desc="Incorporée sous la loi de la province (Loi sur les sociétés par actions du Québec, OBCA en Ontario, etc.). T2 fédéral + déclaration provinciale (CO-17 au QC). Activité limitée à la province."
              selected={value === "inc_provincial_ca"}
              onClick={() => onChange("inc_provincial_ca")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title="Société fédérale (Inc.)"
              desc="Incorporée sous la Loi canadienne sur les sociétés par actions (CBCA), via Corporations Canada. Permet d'opérer dans tout le Canada sous le même nom. T2 fédéral + déclarations provinciales selon présence."
              selected={value === "inc_federal_ca"}
              onClick={() => onChange("inc_federal_ca")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Tipote couvre la TPS (5 % fédérale, ARC) et ses déclinaisons
          provinciales : TVQ 9,975 % au QC (Revenu Québec gère TPS+TVQ
          via FPZ-500), TVH harmonisée 13 % (ON) ou 15 % (NB/NL/NS/PE),
          PST/RST séparée en BC/SK/MB. AB et les territoires (YT, NT, NU)
          ne perçoivent que la TPS. T1/TP-1 (particuliers, autonomes),
          T2/CO-17 (sociétés), DAS/RRQ/RPC/RQAP, acomptes provisionnels.
          Pour les calculs exacts d&apos;impôt et les particularités
          provinciales, ton/ta comptable reste la référence.
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

function BelgiqueFields({
  draft,
  update,
  errors,
  status,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
  status:
    | "independant_principal_be"
    | "independant_complementaire_be"
    | "srl_be"
    | "sa_be";
}) {
  const isCorporate = status === "srl_be" || status === "sa_be";
  const isIndep =
    status === "independant_principal_be" ||
    status === "independant_complementaire_be";

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Belgique :</strong> Tipote calcule tes échéances TVA
        (Intervat), IPP/ISoc, INASTI/RSVZ, comptes annuels BNB et
        listings clients/intra-UE. Pour les calculs exacts d&apos;impôt
        (taux ISoc + derrama, primes régionales, TVA véhicules), ton
        comptable / expert-comptable reste la référence.
      </div>

      <div className="space-y-2">
        <Label htmlFor="be-bce">Numéro BCE (Banque-Carrefour des Entreprises)</Label>
        <p className="text-xs text-muted-foreground">
          10 chiffres. Tu peux le retrouver sur{" "}
          <a
            href="https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            kbopub.economie.fgov.be
          </a>
          .
        </p>
        <Input
          id="be-bce"
          inputMode="numeric"
          maxLength={10}
          value={draft.be_company_number ?? ""}
          onChange={(e) =>
            update("be_company_number", e.target.value.replace(/\D/g, "") || null)
          }
          placeholder="0123456789"
        />
        {errors.be_company_number ? (
          <p className="text-xs text-destructive">{errors.be_company_number}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Ta région</Label>
        <p className="text-xs text-muted-foreground">
          Affecte certaines primes / aides régionales. Le calendrier
          fiscal lui-même reste fédéral.
        </p>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { v: "wallonie", label: "Wallonie" },
              { v: "flandre", label: "Flandre" },
              { v: "bruxelles", label: "Bruxelles-Capitale" },
            ] as const
          ).map((opt) => {
            const active = draft.be_region === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => update("be_region", opt.v)}
                className={`text-sm rounded-md border px-3 py-2 transition ${
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="be-started">
          Date de début d&apos;activité{" "}
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <input
          id="be-started"
          type="date"
          value={draft.be_started_at ?? ""}
          onChange={(e) => update("be_started_at", e.target.value || null)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

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

      <BoolRow
        id="be-vat-franchise"
        title="Régime de franchise TVA ?"
        desc="Si ton CA annuel est sous 25 000 € (art. 56bis CTVA), tu peux opter pour la franchise. Tu ne factures pas la TVA et tu n'as pas de déclarations TVA à déposer."
        helpHref="https://finances.belgium.be/fr/entreprises/tva/regime-franchise"
        helpLabel="Plus d'infos sur la franchise TVA"
        checked={!!draft.be_vat_franchise}
        onChange={(b) => update("be_vat_franchise", b)}
      />

      {!draft.be_vat_franchise ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Périodicité du décompte TVA</Label>
          <p className="text-xs text-muted-foreground">
            Trimestrielle si CA &lt; 2,5 M€ (cas le plus courant).
            Mensuelle au-delà. Date butoir : 20 du mois suivant la
            période, sur Intervat.
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "trimestrielle", label: "Trimestrielle", hint: "défaut, CA < 2,5 M€" },
                { v: "mensuelle", label: "Mensuelle", hint: "CA > 2,5 M€" },
              ] as const
            ).map((opt) => {
              const active = (draft.be_vat_periodicity ?? "trimestrielle") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("be_vat_periodicity", opt.v)}
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
          {errors.be_vat_periodicity ? (
            <p className="text-xs text-destructive">{errors.be_vat_periodicity}</p>
          ) : null}
        </div>
      ) : null}

      <BoolRow
        id="be-intra-eu"
        title="Tu fais des ventes vers l'UE ?"
        desc="Si oui, tu dois déposer un listing intracommunautaire (état 723) chaque trimestre, en plus de tes déclarations TVA. Obligatoire dès 1 € facturé à un client UE assujetti."
        helpHref="https://finances.belgium.be/fr/entreprises/tva/declaration_paiement/listings_intracommunautaires"
        helpLabel="Plus d'infos sur le listing intra-UE"
        checked={!!draft.be_intra_eu_listing}
        onChange={(b) => update("be_intra_eu_listing", b)}
      />

      {isIndep ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Cotisations INASTI/RSVZ : acomptes trimestriels (20 mars,
          20 juin, 20 septembre, 20 décembre), à payer auprès de ta
          caisse d&apos;assurances sociales (Acerta, Group S, Partena,
          Liantis, Xerius…).
        </div>
      ) : null}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Espagne
 * ────────────────────────────────────────────────────────────────── */

function EspagneFields({
  draft,
  update,
  errors,
  status,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
  status: "autonomo_es" | "slu_es" | "sl_es" | "sa_es";
}) {
  const isCorporate = status === "slu_es" || status === "sl_es" || status === "sa_es";
  const isAutonomo = status === "autonomo_es";
  const community = draft.es_community;
  const isCanarias = isCanariasCommunity(community);
  const isIPSI = isIPSICommunity(community);
  const isForal = isForalCommunity(community);

  const cifLabel = (() => {
    switch (status) {
      case "autonomo_es":
        return "NIF / DNI / NIE";
      case "slu_es":
        return "CIF de ta SLU";
      case "sl_es":
        return "CIF de ta SL";
      case "sa_es":
        return "CIF de ta SA";
    }
  })();

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Espagne :</strong> Tipote calcule tes échéances IVA
        (Modelo 303/390/349), IRPF (Modelos 100/130), IS (Modelo
        200/202), RETA mensuel et comptes annuels Registro Mercantil.
        Pour les calculs exacts d&apos;impôt et les déductions IRPF
        spécifiques à ta Comunidad Autónoma, ton asesor fiscal reste
        la référence.
      </div>

      <div className="space-y-2">
        <Label>Comunidad Autónoma</Label>
        <p className="text-xs text-muted-foreground">
          Détermine si tu dépends de l&apos;AEAT (régime commun) ou
          d&apos;une Hacienda Foral (País Vasco, Navarra). Affecte
          aussi l&apos;IVA → IGIC (Canarias) ou IPSI (Ceuta/Melilla).
        </p>
        <Select
          value={draft.es_community ?? ""}
          onValueChange={(v) => update("es_community", v as EsCommunity)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisis ta CCAA" />
          </SelectTrigger>
          <SelectContent>
            {ES_COMMUNITIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.es_community ? (
          <p className="text-xs text-destructive">{errors.es_community}</p>
        ) : null}
        {isForal ? (
          <p className="text-[11px] text-muted-foreground italic">
            Régimen Foral détecté → tu déclares via Hacienda Foral
            (euskadi.eus pour le País Vasco, navarra.es pour la
            Navarra), pas l&apos;AEAT. Calendrier identique mais
            modelos forales.
          </p>
        ) : null}
        {isCanarias ? (
          <p className="text-[11px] text-muted-foreground italic">
            Canarias → IGIC au lieu d&apos;IVA. Tipo general 7%.
            Modelo 420 (trimestriel) / 425 (annuel) au lieu de
            303/390. Pas d&apos;opérations intra-UE.
          </p>
        ) : null}
        {isIPSI ? (
          <p className="text-[11px] text-amber-800 italic">
            Ceuta/Melilla → IPSI (Impuesto sobre la Producción, los
            Servicios y la Importación) au lieu d&apos;IVA. Hors scope
            MVP de Tipote — le module compta affichera tes échéances
            IRPF / IS / RETA mais pas IPSI. Renseigne-toi auprès de
            ta ciudad autónoma.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="es-cif">{cifLabel}</Label>
        <p className="text-xs text-muted-foreground">
          Pour une société : 1 lettre + 8 chiffres (B = SL, A = SA).
          Pour un autónomo : DNI (8 chiffres + 1 lettre) ou NIE.
          Tu peux le retrouver sur{" "}
          <a
            href="https://www.agenciatributaria.gob.es/AEAT.sede/procedimientoini/G306.shtml"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            agenciatributaria.gob.es
          </a>
          .
        </p>
        <Input
          id="es-cif"
          maxLength={20}
          value={draft.es_company_number ?? ""}
          onChange={(e) =>
            update("es_company_number", e.target.value.toUpperCase().slice(0, 20) || null)
          }
          placeholder={isCorporate ? "B12345678" : "12345678A"}
          className="font-mono tracking-wider"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="es-started">
          Date de début d&apos;activité{" "}
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <input
          id="es-started"
          type="date"
          value={draft.es_started_at ?? ""}
          onChange={(e) => update("es_started_at", e.target.value || null)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

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

      {!isIPSI ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Régime IVA{isCanarias ? " (IGIC)" : ""}</Label>
          <p className="text-xs text-muted-foreground">
            General = défaut. Simplificado = forfait pour certaines
            activités (modelo 303 simplifié). Recargo de equivalencia
            = commerce de détail (l&apos;IVA est répercuté par le
            fournisseur). Exención = activités exonérées (santé,
            enseignement, etc.).
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "general", label: "General" },
                { v: "simplificado", label: "Simplificado" },
                { v: "recargo_equivalencia", label: "Recargo de equivalencia" },
                { v: "exencion", label: "Exención" },
              ] as const
            ).map((opt) => {
              const active = draft.es_iva_regime === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("es_iva_regime", opt.v as EsIvaRegime)}
                  className={`text-sm rounded-md border px-3 py-2 transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {errors.es_iva_regime ? (
            <p className="text-xs text-destructive">{errors.es_iva_regime}</p>
          ) : null}
        </div>
      ) : null}

      {!isIPSI && draft.es_iva_regime && draft.es_iva_regime !== "exencion" ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Périodicité des déclarations{isCanarias ? " IGIC" : " IVA"}</Label>
          <p className="text-xs text-muted-foreground">
            Trimestrielle par défaut (T1 → 20/04, T2 → 20/07, T3 →
            20/10, T4 → 30/01). Mensuelle obligatoire si CA &gt; 6 M€
            ou si tu es inscrit au REDEME (registre de remboursement
            mensuel).
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "trimestral", label: "Trimestral", hint: "défaut" },
                { v: "mensual", label: "Mensual", hint: "CA > 6M€ ou REDEME" },
              ] as const
            ).map((opt) => {
              const active = (draft.es_iva_periodicity ?? "trimestral") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("es_iva_periodicity", opt.v as EsIvaPeriodicity)}
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
          {errors.es_iva_periodicity ? (
            <p className="text-xs text-destructive">{errors.es_iva_periodicity}</p>
          ) : null}

          <BoolRow
            id="es-redeme"
            title="Inscrit au REDEME ?"
            desc="Le Registro de Devolución Mensual permet de récupérer la TVA chaque mois (au lieu d'attendre le solde annuel). Inscription volontaire via Modelo 036/039. Implique des déclarations mensuelles."
            helpHref="https://sede.agenciatributaria.gob.es/Sede/iva/redeme.html"
            helpLabel="Plus d'infos sur le REDEME"
            checked={!!draft.es_redeme}
            onChange={(b) => update("es_redeme", b)}
          />
        </div>
      ) : null}

      {isAutonomo ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Méthode IRPF</Label>
          <p className="text-xs text-muted-foreground">
            Estimación directa = comptabilité réelle (Modelo 130
            trimestriel). Module objetiva = forfait par secteur
            d&apos;activité (Modelo 131 trimestriel) — limité à
            certaines activités listées par l&apos;AEAT.
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "directa", label: "Estimación directa", hint: "Modelo 130" },
                { v: "objetiva", label: "Módulos", hint: "Modelo 131" },
              ] as const
            ).map((opt) => {
              const active = (draft.es_irpf_method ?? "directa") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("es_irpf_method", opt.v as EsIrpfMethod)}
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
          {errors.es_irpf_method ? (
            <p className="text-xs text-destructive">{errors.es_irpf_method}</p>
          ) : null}

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground mt-2">
            RETA (Régimen Especial de Trabajadores Autónomos) :
            cotisations mensuelles via la TGSS, basées sur tes
            revenus réels (réforme 2023). Domiciliation bancaire le
            dernier jour ouvré du mois.
          </div>
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

function CanadaFields({
  draft,
  update,
  errors,
  status,
}: {
  draft: ComptaProfileSlice;
  update: <K extends keyof ComptaProfileSlice>(key: K, value: ComptaProfileSlice[K]) => void;
  errors: Record<string, string>;
  status: AccountingStatus;
}) {
  const province = draft.ca_province;
  const taxRegime = caTaxRegime(province);
  const isCorporate = status === "inc_provincial_ca" || status === "inc_federal_ca";
  const isAutonome =
    status === "travailleur_autonome_ca" || status === "entreprise_individuelle_ca";
  const isImmatricule = status === "entreprise_individuelle_ca";

  // Étiquette de la taxe affichée à l'user selon la province choisie.
  const taxLabel = (() => {
    if (taxRegime === "tps_tvq") return "TPS + TVQ";
    if (taxRegime === "tvh") return "TVH";
    if (taxRegime === "tps_pst") {
      return province === "MB" ? "TPS + RST" : "TPS + PST";
    }
    return "TPS";
  })();

  return (
    <Card className="p-4 space-y-4">
      {/* Province / territoire */}
      <div className="space-y-2">
        <Label>Province ou territoire</Label>
        <Select
          value={draft.ca_province ?? ""}
          onValueChange={(v) => update("ca_province", v as CaProvince)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisis ta province / ton territoire" />
          </SelectTrigger>
          <SelectContent>
            {CA_PROVINCES.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.ca_province ? (
          <p className="text-xs text-destructive">{errors.ca_province}</p>
        ) : null}
        {province ? (
          <p className="text-xs text-muted-foreground">
            Régime de taxes : <strong>{taxLabel}</strong>.{" "}
            {taxRegime === "tps_tvq" ? (
              <>Revenu Québec gère TPS et TVQ ensemble via le formulaire FPZ-500.</>
            ) : taxRegime === "tvh" ? (
              <>TVH harmonisée gérée par l&apos;ARC ({province === "ON" ? "13 %" : "15 %"}).</>
            ) : taxRegime === "tps_pst" ? (
              <>
                TPS fédérale (5 %) et {province === "MB" ? "RST" : "PST"} provinciale
                ({province === "BC" ? "7 %" : province === "SK" ? "6 %" : "7 %"}) déclarées
                séparément.
              </>
            ) : (
              <>Pas de taxe provinciale, juste la TPS fédérale (5 %).</>
            )}
          </p>
        ) : null}
      </div>

      {/* Numéro d'entreprise */}
      <div className="space-y-2">
        <Label htmlFor="ca-bn">
          Numéro d&apos;entreprise{" "}
          <span className="text-muted-foreground">
            ({province === "QC" ? "NEQ ou Business Number ARC" : "Business Number ARC"})
          </span>
        </Label>
        <Input
          id="ca-bn"
          value={draft.ca_business_number ?? ""}
          onChange={(e) => update("ca_business_number", e.target.value || null)}
          placeholder={province === "QC" ? "1234567890 (NEQ) ou 123456789 (BN)" : "123456789"}
        />
        <p className="text-[11px] text-muted-foreground">
          Le BN ARC fait 9 chiffres (les comptes RT/RC/RP s&apos;ajoutent en suffixe). Le NEQ
          québécois fait 10 chiffres. Optionnel si tu n&apos;es pas immatriculé.
        </p>
      </div>

      {/* Date de début */}
      <div className="space-y-2">
        <Label htmlFor="ca-started">Date de début d&apos;activité (facultative)</Label>
        <Input
          id="ca-started"
          type="date"
          value={draft.ca_started_at ?? ""}
          onChange={(e) => update("ca_started_at", e.target.value || null)}
        />
      </div>

      {/* Petit fournisseur + inscription TPS */}
      {isAutonome ? (
        <BoolRow
          id="ca-petit-fournisseur"
          title="Petit fournisseur (CA < 30 000 $/4 trimestres) ?"
          desc="Si ton CA mondial est sous 30 000 $ sur 4 trimestres consécutifs, tu n'es pas obligé de t'inscrire à la TPS. Tu peux quand même t'inscrire volontairement pour récupérer les CTI/RTI sur tes achats."
          helpHref="https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/tps-tvh-entreprises/inscription-compte-tps-tvh.html"
          helpLabel="En savoir plus sur l'inscription TPS"
          checked={!!draft.ca_petit_fournisseur}
          onChange={(b) => update("ca_petit_fournisseur", b)}
        />
      ) : null}

      <BoolRow
        id="ca-gst-registered"
        title={`Inscrit à la ${taxLabel} ?`}
        desc={
          taxRegime === "tps_tvq"
            ? "Inscrit à la TPS et à la TVQ (Revenu Québec gère les deux). Obligatoire si CA > 30 000 $, optionnel sinon."
            : "Inscrit à la TPS (et à la taxe provinciale qui s'applique). Obligatoire si CA > 30 000 $, optionnel sinon (avec récupération des CTI/RTI à la clé)."
        }
        helpHref="https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/tps-tvh-entreprises.html"
        helpLabel="Tout sur la TPS/TVH"
        checked={!!draft.ca_gst_registered}
        onChange={(b) => update("ca_gst_registered", b)}
      />

      {/* Périodicité TPS */}
      {draft.ca_gst_registered ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Périodicité de tes déclarations {taxLabel}</Label>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
            {(
              [
                { v: "annuelle", label: "Annuelle", hint: "CA < 1,5 M$ (défaut)" },
                { v: "trimestrielle", label: "Trimestrielle", hint: "CA 1,5–6 M$" },
                { v: "mensuelle", label: "Mensuelle", hint: "CA > 6 M$" },
              ] as const
            ).map((opt) => {
              const active = (draft.ca_gst_periodicity ?? "annuelle") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("ca_gst_periodicity", opt.v as CaGstPeriodicity)}
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
          {errors.ca_gst_periodicity ? (
            <p className="text-xs text-destructive">{errors.ca_gst_periodicity}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            La périodicité est assignée par l&apos;ARC selon ton volume — l&apos;option ici
            correspond à ce qui t&apos;a été notifié. Tu peux demander un changement (vers
            plus fréquent toujours possible, vers moins fréquent si CA en baisse).
          </p>
        </div>
      ) : null}

      {/* Disclaimer immatriculation REQ pour entreprise individuelle au QC */}
      {isImmatricule && province === "QC" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
          <strong>Rappel REQ :</strong> en tant qu&apos;entreprise individuelle immatriculée
          au Registraire des entreprises du Québec, tu dois produire une déclaration de
          mise à jour annuelle (à la date anniversaire d&apos;immatriculation).{" "}
          <ExternalLinkRow
            href="https://www.registreentreprises.gouv.qc.ca/"
            label="Portail REQ"
          />
        </div>
      ) : null}

      {/* Exercice comptable pour les sociétés */}
      {isCorporate ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>Exercice comptable</Label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update("ca_fiscal_year_calendar", true)}
              className={`text-sm rounded-md border px-3 py-2 ${
                draft.ca_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Année civile (jan → déc)
            </button>
            <button
              type="button"
              onClick={() => update("ca_fiscal_year_calendar", false)}
              className={`text-sm rounded-md border px-3 py-2 ${
                !draft.ca_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              Décalé
            </button>
          </div>
          {!draft.ca_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">Mois de début d&apos;exercice</Label>
              <select
                value={draft.ca_fiscal_year_start_month ?? ""}
                onChange={(e) =>
                  update("ca_fiscal_year_start_month", parseInt(e.target.value, 10) || null)
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
              {errors.ca_fiscal_year_start_month ? (
                <p className="text-xs text-destructive">{errors.ca_fiscal_year_start_month}</p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Le T2 fédéral est dû 6 mois après la fin d&apos;exercice. Le solde est dû à
                2 mois (3 mois pour SPCC admissible à la déduction accordée aux petites
                entreprises).
              </p>
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {status === "inc_federal_ca"
              ? "Société fédérale (CBCA) : siège social typiquement déclaré dans une province d'opération. Si le siège est au QC, immatriculation REQ obligatoire en plus de Corporations Canada."
              : province === "QC"
                ? "Société provinciale du Québec (LSAQ) : immatriculation REQ obligatoire."
                : "Société provinciale : immatriculation au registre provincial des entreprises (selon la province choisie)."}
          </p>
        </div>
      ) : null}
    </Card>
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
