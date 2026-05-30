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
import { useTranslations } from "next-intl";
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
  type UsState,
  type UsLlcTaxClassification,
  US_STATES,
  usHasStateIncomeTax,
  usHasStateSalesTax,
  emptyComptaSlice,
  SIREN_REGEX,
} from "@/lib/compta/types";

interface Props {
  initial: ComptaProfileSlice;
  /** Pays détecté côté parent (FR / CH / PT / BE / ES / CA) — détermine
   *  quelles cartes de statut on propose. */
  country: "FR" | "CH" | "PT" | "BE" | "ES" | "CA" | "US";
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
  const t = useTranslations("comptaConfig");
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
      next.accounting_status = t("errChooseStatus");
    } else if (status === "particulier") {
      if (!draft.particulier_revenue_type) {
        next.particulier_revenue_type = t("errParticulierRevenue");
      }
    } else if (status === "auto_entrepreneur") {
      if (!draft.ae_activity_type) {
        next.ae_activity_type = t("errAeActivity");
      }
      if (!draft.ae_started_at) {
        next.ae_started_at = t("errAeStarted");
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
        next.sasu_siren = t("errSirenInvalid");
      }
      if (!draft.sasu_fiscal_year_calendar && !draft.sasu_fiscal_year_start_month) {
        next.sasu_fiscal_year_start_month = t("errFiscalYearStartMonth");
      }
      // Régime TVA obligatoire pour les sociétés à l'IS. Pour une
      // EURL à l'IR, la TVA reste optionnelle (souvent en franchise).
      const isAtIS =
        status === "sasu" ||
        status === "sas" ||
        status === "sarl" ||
        (status === "eurl" && draft.eurl_is_election);
      if (isAtIS && !draft.sasu_vat_regime) {
        next.sasu_vat_regime = t("errVatRegime");
      }
    } else if (
      status === "independant_ch" ||
      status === "sarl_ch" ||
      status === "sa_ch"
    ) {
      if (draft.ch_vat_assujetti && !draft.ch_vat_periodicity) {
        next.ch_vat_periodicity = t("errChVatPeriodicity");
      }
    } else if (
      status === "trabalhador_independente_pt" ||
      status === "eni_pt" ||
      status === "lda_unipessoal_pt" ||
      status === "lda_pt" ||
      status === "sa_pt"
    ) {
      if (draft.pt_nif && !/^\d{9}$/.test(draft.pt_nif)) {
        next.pt_nif = t("errPtNifInvalid");
      }
      if (!draft.pt_iva_isento && !draft.pt_iva_periodicity) {
        next.pt_iva_periodicity = t("errPtIvaPeriodicity");
      }
    } else if (
      status === "independant_principal_be" ||
      status === "independant_complementaire_be" ||
      status === "srl_be" ||
      status === "sa_be"
    ) {
      if (draft.be_company_number && !/^\d{10}$/.test(draft.be_company_number)) {
        next.be_company_number = t("errBeCompanyNumber");
      }
      if (!draft.be_vat_franchise && !draft.be_vat_periodicity) {
        next.be_vat_periodicity = t("errBeVatPeriodicity");
      }
    } else if (
      status === "autonomo_es" ||
      status === "slu_es" ||
      status === "sl_es" ||
      status === "sa_es"
    ) {
      if (!draft.es_community) {
        next.es_community = t("errEsCommunity");
      }
      if (!draft.es_iva_regime && !isIPSICommunity(draft.es_community)) {
        next.es_iva_regime = t("errEsIvaRegime");
      }
      if (
        draft.es_iva_regime &&
        draft.es_iva_regime !== "exencion" &&
        !isIPSICommunity(draft.es_community) &&
        !draft.es_iva_periodicity
      ) {
        next.es_iva_periodicity = t("errEsIvaPeriodicity");
      }
      if (status === "autonomo_es" && !draft.es_irpf_method) {
        next.es_irpf_method = t("errEsIrpfMethod");
      }
    } else if (
      status === "travailleur_autonome_ca" ||
      status === "entreprise_individuelle_ca" ||
      status === "inc_provincial_ca" ||
      status === "inc_federal_ca"
    ) {
      if (!draft.ca_province) {
        next.ca_province = t("errCaProvince");
      }
      if (draft.ca_gst_registered && !draft.ca_gst_periodicity) {
        next.ca_gst_periodicity = t("errCaGstPeriodicity");
      }
      if (
        (status === "inc_provincial_ca" || status === "inc_federal_ca") &&
        !draft.ca_fiscal_year_calendar &&
        !draft.ca_fiscal_year_start_month
      ) {
        next.ca_fiscal_year_start_month = t("errFiscalYearStartMonth");
      }
    } else if (
      status === "sole_proprietorship_us" ||
      status === "single_member_llc_us" ||
      status === "multi_member_llc_us" ||
      status === "c_corp_us" ||
      status === "s_corp_us"
    ) {
      if (!draft.us_state) {
        next.us_state = t("errUsState");
      }
      if (draft.us_ein && !/^\d{2}-?\d{7}$/.test(draft.us_ein.replace(/\s/g, ""))) {
        next.us_ein = t("errUsEinInvalid");
      }
      if (
        (status === "c_corp_us" || status === "s_corp_us") &&
        !draft.us_fiscal_year_calendar &&
        !draft.us_fiscal_year_start_month
      ) {
        next.us_fiscal_year_start_month = t("errFiscalYearStartMonth");
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
    } else if (
      status === "sole_proprietorship_us" ||
      status === "single_member_llc_us" ||
      status === "multi_member_llc_us" ||
      status === "c_corp_us" ||
      status === "s_corp_us"
    ) {
      patch.us_state = draft.us_state;
      patch.us_ein = draft.us_ein;
      patch.us_sales_tax_states = draft.us_sales_tax_states ?? [];
      // Élection LLC : seulement pour les statuts LLC. Sinon NULL.
      patch.us_llc_tax_classification =
        status === "single_member_llc_us" || status === "multi_member_llc_us"
          ? draft.us_llc_tax_classification
          : null;
      patch.us_started_at = draft.us_started_at;
      if (status === "c_corp_us" || status === "s_corp_us") {
        patch.us_fiscal_year_calendar = draft.us_fiscal_year_calendar;
        patch.us_fiscal_year_start_month = draft.us_fiscal_year_calendar
          ? null
          : draft.us_fiscal_year_start_month;
      } else {
        // Sole prop / LLC pass-through → calendar year forcé (les
        // partnerships et S-Corp doivent avoir le même fiscal year
        // que leurs associés/shareholders, qui sont sur calendar year
        // dans 99 % des cas).
        patch.us_fiscal_year_calendar = true;
        patch.us_fiscal_year_start_month = null;
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

      {status === "sole_proprietorship_us" ||
      status === "single_member_llc_us" ||
      status === "multi_member_llc_us" ||
      status === "c_corp_us" ||
      status === "s_corp_us" ? (
        <UnitedStatesFields draft={draft} update={update} errors={errors} status={status} />
      ) : null}

      {status ? (
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t("saveConfig")}
              </>
            )}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("cancel")}
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
  country: "FR" | "CH" | "PT" | "BE" | "ES" | "CA" | "US";
  onChange: (v: AccountingStatus) => void;
}) {
  const t = useTranslations("comptaConfig");

  if (country === "CH") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("withoutDedicatedCompany")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title={t("particulierTitle")}
              desc={t("particulierDescCH")}
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("indepCHTitle")}
              desc={t("indepCHDesc")}
              selected={value === "independant_ch"}
              onClick={() => onChange("independant_ch")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("commercialCompany")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("sarlCHTitle")}
              desc={t("sarlCHDesc")}
              selected={value === "sarl_ch"}
              onClick={() => onChange("sarl_ch")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("saCHTitle")}
              desc={t("saCHDesc")}
              selected={value === "sa_ch"}
              onClick={() => onChange("sa_ch")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          {t("chDisclaimer")}
        </p>
      </div>
    );
  }

  if (country === "PT") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("withoutDedicatedCompany")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title={t("particulierTitle")}
              desc={t("particulierDescPT")}
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("trabalhadorIndepTitle")}
              desc={t("trabalhadorIndepDesc")}
              selected={value === "trabalhador_independente_pt"}
              onClick={() => onChange("trabalhador_independente_pt")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("eniTitle")}
              desc={t("eniDesc")}
              selected={value === "eni_pt"}
              onClick={() => onChange("eni_pt")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("commercialCompanyIRC")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("ldaUniTitle")}
              desc={t("ldaUniDesc")}
              selected={value === "lda_unipessoal_pt"}
              onClick={() => onChange("lda_unipessoal_pt")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("ldaTitle")}
              desc={t("ldaDesc")}
              selected={value === "lda_pt"}
              onClick={() => onChange("lda_pt")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("saPTTitle")}
              desc={t("saPTDesc")}
              selected={value === "sa_pt"}
              onClick={() => onChange("sa_pt")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          {t("ptDisclaimer")}
        </p>
      </div>
    );
  }

  if (country === "BE") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("withoutDedicatedCompany")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title={t("particulierTitle")}
              desc={t("particulierDescBE")}
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("indepPrincipalBETitle")}
              desc={t("indepPrincipalBEDesc")}
              selected={value === "independant_principal_be"}
              onClick={() => onChange("independant_principal_be")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("indepComplBETitle")}
              desc={t("indepComplBEDesc")}
              selected={value === "independant_complementaire_be"}
              onClick={() => onChange("independant_complementaire_be")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("commercialCompanyISoc")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("srlBETitle")}
              desc={t("srlBEDesc")}
              selected={value === "srl_be"}
              onClick={() => onChange("srl_be")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("saBETitle")}
              desc={t("saBEDesc")}
              selected={value === "sa_be"}
              onClick={() => onChange("sa_be")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          {t("beDisclaimer")}
        </p>
      </div>
    );
  }

  if (country === "ES") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("withoutDedicatedCompany")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title={t("particulierTitle")}
              desc={t("particulierDescES")}
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("autonomoESTitle")}
              desc={t("autonomoESDesc")}
              selected={value === "autonomo_es"}
              onClick={() => onChange("autonomo_es")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("commercialCompanyIS_ES")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("sluESTitle")}
              desc={t("sluESDesc")}
              selected={value === "slu_es"}
              onClick={() => onChange("slu_es")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("slESTitle")}
              desc={t("slESDesc")}
              selected={value === "sl_es"}
              onClick={() => onChange("sl_es")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("saESTitle")}
              desc={t("saESDesc")}
              selected={value === "sa_es"}
              onClick={() => onChange("sa_es")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          {t("esDisclaimer")}
        </p>
      </div>
    );
  }

  if (country === "CA") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("withoutCompany")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title={t("particulierTitle")}
              desc={t("particulierDescCA")}
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("travAutonomeCATitle")}
              desc={t("travAutonomeCADesc")}
              selected={value === "travailleur_autonome_ca"}
              onClick={() => onChange("travailleur_autonome_ca")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("entIndivCATitle")}
              desc={t("entIndivCADesc")}
              selected={value === "entreprise_individuelle_ca"}
              onClick={() => onChange("entreprise_individuelle_ca")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("incorporated_CA")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("incProvCATitle")}
              desc={t("incProvCADesc")}
              selected={value === "inc_provincial_ca"}
              onClick={() => onChange("inc_provincial_ca")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("incFedCATitle")}
              desc={t("incFedCADesc")}
              selected={value === "inc_federal_ca"}
              onClick={() => onChange("inc_federal_ca")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          {t("caDisclaimer")}
        </p>
      </div>
    );
  }

  if (country === "US") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("withoutEntity_US")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<User className="h-5 w-5" />}
              title={t("particulierTitle")}
              desc={t("particulierDescUS")}
              selected={value === "particulier"}
              onClick={() => onChange("particulier")}
            />
            <StatusCard
              icon={<Briefcase className="h-5 w-5" />}
              title={t("solePropTitle")}
              desc={t("solePropDesc")}
              selected={value === "sole_proprietorship_us"}
              onClick={() => onChange("sole_proprietorship_us")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("llc_US")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("smllcTitle")}
              desc={t("smllcDesc")}
              selected={value === "single_member_llc_us"}
              onClick={() => onChange("single_member_llc_us")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("mmllcTitle")}
              desc={t("mmllcDesc")}
              selected={value === "multi_member_llc_us"}
              onClick={() => onChange("multi_member_llc_us")}
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("corporation_US")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("cCorpTitle")}
              desc={t("cCorpDesc")}
              selected={value === "c_corp_us"}
              onClick={() => onChange("c_corp_us")}
            />
            <StatusCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("sCorpTitle")}
              desc={t("sCorpDesc")}
              selected={value === "s_corp_us"}
              onClick={() => onChange("s_corp_us")}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          {t("usDisclaimer")}
        </p>
      </div>
    );
  }

  // FR (défaut)
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-base">{t("statusQuestion")}</h3>

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          {t("withoutDedicatedCompany")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon={<User className="h-5 w-5" />}
            title={t("particulierTitle")}
            desc={t("particulierDescFR")}
            selected={value === "particulier"}
            onClick={() => onChange("particulier")}
          />
          <StatusCard
            icon={<Briefcase className="h-5 w-5" />}
            title={t("aeTitle")}
            desc={t("aeDesc")}
            selected={value === "auto_entrepreneur"}
            onClick={() => onChange("auto_entrepreneur")}
          />
          <StatusCard
            icon={<Briefcase className="h-5 w-5" />}
            title={t("eurlTitle")}
            desc={t("eurlDesc")}
            selected={value === "eurl"}
            onClick={() => onChange("eurl")}
          />
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          {t("companyIS_FR")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon={<Building2 className="h-5 w-5" />}
            title={t("sasuTitle")}
            desc={t("sasuDesc")}
            selected={value === "sasu"}
            onClick={() => onChange("sasu")}
          />
          <StatusCard
            icon={<Building2 className="h-5 w-5" />}
            title={t("sasTitle")}
            desc={t("sasDesc")}
            selected={value === "sas"}
            onClick={() => onChange("sas")}
          />
          <StatusCard
            icon={<Building2 className="h-5 w-5" />}
            title={t("sarlTitle")}
            desc={t("sarlDesc")}
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
  const t = useTranslations("comptaConfig");
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h4 className="font-semibold">{t("particulierQuestion")}</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {t("particulierQuestionHint")}
        </p>
      </div>

      <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as ParticulierRevenueType)}>
        <div className="flex items-start gap-3 py-2">
          <RadioGroupItem value="bnc_accessoire" id="bnc_accessoire" className="mt-1" />
          <Label htmlFor="bnc_accessoire" className="font-normal cursor-pointer">
            <span className="font-medium">{t("bncAccessLabel")}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {t("bncAccessHint")}
            </span>
          </Label>
        </div>

        <div className="flex items-start gap-3 py-2">
          <RadioGroupItem value="bic_accessoire" id="bic_accessoire" className="mt-1" />
          <Label htmlFor="bic_accessoire" className="font-normal cursor-pointer">
            <span className="font-medium">{t("bicAccessLabel")}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {t("bicAccessHint")}
            </span>
          </Label>
        </div>

        <div className="flex items-start gap-3 py-2">
          <RadioGroupItem value="autre" id="autre" className="mt-1" />
          <Label htmlFor="autre" className="font-normal cursor-pointer">
            <span className="font-medium">{t("otherLabel")}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {t("otherHint")}
            </span>
          </Label>
        </div>
      </RadioGroup>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <ExternalLinkRow
        href="https://www.impots.gouv.fr/particulier/professions-non-salariees-revenus-fonciers-pme"
        label={t("particulierHelpLabel")}
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
  const t = useTranslations("comptaConfig");
  return (
    <Card className="p-5 space-y-5">
      {/* Activité */}
      <div className="space-y-2">
        <Label htmlFor="ae-activity">{t("aeActivityLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("aeActivityHint")}
        </p>
        <Select
          value={draft.ae_activity_type ?? ""}
          onValueChange={(v) => update("ae_activity_type", v as AeActivityType)}
        >
          <SelectTrigger id="ae-activity">
            <SelectValue placeholder={t("aeActivityPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vente">{t("aeActivityVente")}</SelectItem>
            <SelectItem value="services_bic">{t("aeActivityServicesBic")}</SelectItem>
            <SelectItem value="services_bnc">{t("aeActivityServicesBnc")}</SelectItem>
            <SelectItem value="mixte">{t("aeActivityMixte")}</SelectItem>
          </SelectContent>
        </Select>
        {errors.ae_activity_type ? (
          <p className="text-xs text-destructive">{errors.ae_activity_type}</p>
        ) : null}
      </div>

      {/* Date début */}
      <div className="space-y-2">
        <Label htmlFor="ae-started-at">{t("aeStartedLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("aeStartedHint")}
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
        title={t("aeAcreTitle")}
        desc={t("aeAcreDesc")}
        helpHref="https://www.urssaf.fr/accueil/independant/cotisations/exonerations/acre.html"
        helpLabel={t("aeAcreHelpLabel")}
        checked={!!draft.ae_acre}
        onChange={(b) => update("ae_acre", b)}
      />

      {/* Versement libératoire */}
      <BoolRow
        id="ae-vl"
        title={t("aeVlTitle")}
        desc={t("aeVlDesc")}
        helpHref="https://www.service-public.fr/particuliers/vosdroits/F23267"
        helpLabel={t("aeVlHelpLabel")}
        checked={!!draft.ae_versement_liberatoire}
        onChange={(b) => update("ae_versement_liberatoire", b)}
      />

      {/* Franchise TVA */}
      <BoolRow
        id="ae-vat-franchise"
        title={t("aeVatFranchiseTitle")}
        desc={t("aeVatFranchiseDesc")}
        helpHref="https://www.service-public.fr/professionnels-entreprises/vosdroits/F32353"
        helpLabel={t("aeVatFranchiseHelpLabel")}
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
            {t("aeVatRegimeLabel")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t("aeVatRegimeHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "simplifie", label: t("aeVatSimplifie"), hint: t("aeVatSimplifieHint") },
                { v: "reel_trimestriel", label: t("aeVatReelTrim"), hint: t("aeVatReelTrimHint") },
                { v: "reel_mensuel", label: t("aeVatReelMens"), hint: t("aeVatReelMensHint") },
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
          {t("aeUrssafLabel")}
        </label>
        <p className="text-xs text-muted-foreground">
          {t("aeUrssafHint")}
        </p>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { v: "trimestrielle", label: t("aeUrssafQuarterly"), hint: t("aeUrssafQuarterlyHint") },
              { v: "mensuelle", label: t("aeUrssafMonthly"), hint: "" },
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
  const t = useTranslations("comptaConfig");
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
        return t("sirenLabelSASU");
      case "sas":
        return t("sirenLabelSAS");
      case "sarl":
        return t("sirenLabelSARL");
      case "eurl":
        return t("sirenLabelEURL");
    }
  })();

  return (
    <Card className="p-5 space-y-5">
      {/* Spécificité EURL : option IS — affiché en premier car ça
          change la nature des autres champs (TVA notamment). */}
      {status === "eurl" ? (
        <div className="space-y-2">
          <Label>{t("eurlRegimeLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("eurlRegimeHint")}
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
              <div>{t("eurlIRDefault")}</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                {t("eurlIRHint")}
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
              <div>{t("eurlISOption")}</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                {t("eurlISHint")}
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {/* Spécificité SARL : gérant majoritaire vs minoritaire */}
      {status === "sarl" ? (
        <div className="space-y-2">
          <Label>{t("sarlGerantQuestion")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("sarlGerantHint")}
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
              {t("sarlMajoritaire")}
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
              {t("sarlMinoritaire")}
            </button>
          </div>
        </div>
      ) : null}

      {isEurlIR ? (
        <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-900 dark:text-blue-200">
          {t("eurlIRBox")}
        </div>
      ) : null}

      {/* SIREN — commun à toutes les formes société */}
      <div className="space-y-2">
        <Label htmlFor="sasu-siren">{sirenLabel}</Label>
        <p className="text-xs text-muted-foreground">
          {t("sirenHintBefore")}{" "}
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
        <Label>{t("fiscalYearLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("fiscalYearHintFR")}
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
            {t("fyCalendarLabel")}
          </Label>
        </div>

        {!draft.sasu_fiscal_year_calendar ? (
          <div className="space-y-1 pl-1">
            <Label htmlFor="sasu-fy-start" className="text-xs">
              {t("fyStartMonthLabel")}
            </Label>
            <Select
              value={draft.sasu_fiscal_year_start_month?.toString() ?? ""}
              onValueChange={(v) => update("sasu_fiscal_year_start_month", parseInt(v, 10))}
            >
              <SelectTrigger id="sasu-fy-start" className="w-[200px]">
                <SelectValue placeholder={t("fyStartMonthPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {[
                  t("monthJanuary"), t("monthFebruary"), t("monthMarch"), t("monthApril"), t("monthMay"), t("monthJune"),
                  t("monthJuly"), t("monthAugust"), t("monthSeptember"), t("monthOctober"), t("monthNovember"), t("monthDecember"),
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
        <Label htmlFor="sasu-vat-regime">{t("vatRegimeLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("vatRegimeHint")}
        </p>
        <Select
          value={draft.sasu_vat_regime ?? ""}
          onValueChange={(v) => update("sasu_vat_regime", v as SasuVatRegime)}
        >
          <SelectTrigger id="sasu-vat-regime">
            <SelectValue placeholder={t("vatRegimePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reel_mensuel">{t("vatReelMensuel")}</SelectItem>
            <SelectItem value="reel_trimestriel">{t("vatReelTrim")}</SelectItem>
            <SelectItem value="simplifie">{t("vatSimplifie")}</SelectItem>
          </SelectContent>
        </Select>
        {errors.sasu_vat_regime ? (
          <p className="text-xs text-destructive">{errors.sasu_vat_regime}</p>
        ) : null}
        <ExternalLinkRow
          href="https://www.impots.gouv.fr/professionnel/declaration-de-tva"
          label={t("vatHelpLabel")}
        />
      </div>

      {/* TVA intra */}
      <BoolRow
        id="sasu-vat-intra"
        title={t("sasuVatIntraTitle")}
        desc={t("sasuVatIntraDesc")}
        helpHref="https://www.douane.gouv.fr/des-prestations-de-services"
        helpLabel={t("sasuVatIntraHelpLabel")}
        checked={!!draft.sasu_vat_intra_enabled}
        onChange={(b) => update("sasu_vat_intra_enabled", b)}
      />

      {/* Dirigeant rémunéré */}
      <BoolRow
        id="sasu-dirigeant-remunere"
        title={t("sasuDirigeantTitle")}
        desc={t("sasuDirigeantDesc")}
        helpHref="https://www.service-public.fr/professionnels-entreprises/vosdroits/F31198"
        helpLabel={t("sasuDirigeantHelpLabel")}
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
  const t = useTranslations("comptaConfig");
  const isCorporate = status === "sarl_ch" || status === "sa_ch";

  return (
    <Card className="p-5 space-y-5">
      {/* Disclaimer cantonal — Tipote couvre les 26 cantons sur les
          dates butoir et le portail, mais pas les taux d'imposition. */}
      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
        {t("chImportantBox")}
      </div>

      {/* Canton — sélecteur des 26 valeurs ISO 3166-2 CH-XX */}
      <div className="space-y-2">
        <Label htmlFor="ch-canton">{t("chCantonLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("chCantonHint")}
        </p>
        <select
          id="ch-canton"
          value={draft.ch_canton ?? ""}
          onChange={(e) => update("ch_canton", e.target.value || null)}
          className="w-full h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">{t("chCantonPlaceholder")}</option>
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
          {t("startedAtLabel")}{" "}
          <span className="text-muted-foreground font-normal">{t("optional")}</span>
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
            {t("chIdeLabel")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("chIdeHintBefore")}{" "}
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
          <Label>{t("accountingExerciseLabel")}</Label>
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
              {t("calendarYearShort")}
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
              {t("shifted")}
            </button>
          </div>
          {!draft.sasu_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">{t("fyStartMonthShortLabel")}</Label>
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
                    {monthName(m, t)}
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
        title={t("chVatAssujettiTitle")}
        desc={t("chVatAssujettiDesc")}
        helpHref="https://www.estv.admin.ch/estv/fr/accueil/tva.html"
        helpLabel={t("chVatThresholdsLabel")}
        checked={!!draft.ch_vat_assujetti}
        onChange={(b) => update("ch_vat_assujetti", b)}
      />

      {/* Périodicité TVA + méthode (visibles seulement si assujetti) */}
      {draft.ch_vat_assujetti ? (
        <>
          <div className="space-y-2 pt-3 border-t">
            <Label>{t("chVatPeriodicityLabel")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("chVatPeriodicityHint")}
            </p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { v: "trimestrielle", label: t("freqTrimestrielle"), hint: t("hintDefault") },
                  { v: "mensuelle", label: t("freqMensuelle"), hint: t("hintRare") },
                  { v: "semestrielle", label: t("freqSemestrielle"), hint: t("hintTDFN") },
                  { v: "annuelle", label: t("freqAnnuelle"), hint: t("hintSmallCA") },
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
            <Label>{t("chVatMethodLabel")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("chVatMethodHint")}
            </p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { v: "effective", label: t("chMethodEffective"), hint: t("hintDefault") },
                  { v: "tdfn", label: t("chMethodTDFN"), hint: t("chTDFNHint") },
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

function monthName(m: number, t: (key: string) => string): string {
  const keys = [
    "monthJanuary", "monthFebruary", "monthMarch", "monthApril", "monthMay", "monthJune",
    "monthJuly", "monthAugust", "monthSeptember", "monthOctober", "monthNovember", "monthDecember",
  ];
  const k = keys[m - 1];
  return k ? t(k) : "";
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
  const t = useTranslations("comptaConfig");
  const isCorporate =
    status === "lda_unipessoal_pt" ||
    status === "lda_pt" ||
    status === "sa_pt";
  const isIndepOrEni =
    status === "trabalhador_independente_pt" || status === "eni_pt";

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
        {t("ptImportantBox")}
      </div>

      {/* NIF — 9 chiffres, géré par l'AT */}
      <div className="space-y-2">
        <Label htmlFor="pt-nif">{t("ptNifLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("ptNifHintBefore")}{" "}
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
        <Label>{t("ptRegionLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("ptRegionHint")}
        </p>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { v: "continente", label: t("ptRegionContinent"), hint: "23% / 13% / 6%" },
              { v: "madeira", label: t("ptRegionMadeira"), hint: "22% / 12% / 5%" },
              { v: "acores", label: t("ptRegionAcores"), hint: "16% / 9% / 4%" },
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
          {t("startedAtLabel")}{" "}
          <span className="text-muted-foreground font-normal">{t("optional")}</span>
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
          <Label>{t("ptTaxRegimeLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("ptTaxRegimeHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "simplificado", label: t("ptSimplificadoLabel"), hint: t("hintDefault") },
                { v: "organizada", label: t("ptOrganizadaLabel"), hint: t("ptOrganizadaHint") },
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
              {t("calendarYearShort")}
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
              {t("shifted")}
            </button>
          </div>
          {!draft.sasu_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">{t("fyStartMonthShortLabel")}</Label>
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
                    {monthName(m, t)}
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
        title={t("ptIvaIsentoTitle")}
        desc={t("ptIvaIsentoDesc")}
        helpHref="https://info-ras.at.gov.pt/"
        helpLabel={t("ptIvaIsentoHelpLabel")}
        checked={!!draft.pt_iva_isento}
        onChange={(b) => update("pt_iva_isento", b)}
      />

      {/* Périodicité IVA si non-isento */}
      {!draft.pt_iva_isento ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("ptIvaPeriodicityLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("ptIvaPeriodicityHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "trimestral", label: t("ptFreqTrimestral"), hint: t("ptHintTrimestralDefault") },
                { v: "mensal", label: t("ptFreqMensal"), hint: t("ptHintMensalLarge") },
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
  const t = useTranslations("comptaConfig");
  const isCorporate = status === "srl_be" || status === "sa_be";
  const isIndep =
    status === "independant_principal_be" ||
    status === "independant_complementaire_be";

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
        {t("beImportantBox")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="be-bce">{t("beBceLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("beBceHintBefore")}{" "}
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
        <Label>{t("beRegionLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("beRegionHint")}
        </p>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { v: "wallonie", label: t("beRegionWallonie") },
              { v: "flandre", label: t("beRegionFlandre") },
              { v: "bruxelles", label: t("beRegionBruxelles") },
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
          {t("startedAtLabel")}{" "}
          <span className="text-muted-foreground font-normal">{t("optional")}</span>
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
          <Label>{t("accountingExerciseLabel")}</Label>
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
              {t("calendarYearShort")}
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
              {t("shifted")}
            </button>
          </div>
          {!draft.sasu_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">{t("fyStartMonthShortLabel")}</Label>
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
                    {monthName(m, t)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      <BoolRow
        id="be-vat-franchise"
        title={t("beVatFranchiseTitle")}
        desc={t("beVatFranchiseDesc")}
        helpHref="https://finances.belgium.be/fr/entreprises/tva/regime-franchise"
        helpLabel={t("beVatFranchiseHelpLabel")}
        checked={!!draft.be_vat_franchise}
        onChange={(b) => update("be_vat_franchise", b)}
      />

      {!draft.be_vat_franchise ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("beVatPeriodicityLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("beVatPeriodicityHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "trimestrielle", label: t("freqTrimestrielle"), hint: t("beHintTrimDefault") },
                { v: "mensuelle", label: t("freqMensuelle"), hint: t("beHintMensLarge") },
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
        title={t("beIntraEuTitle")}
        desc={t("beIntraEuDesc")}
        helpHref="https://finances.belgium.be/fr/entreprises/tva/declaration_paiement/listings_intracommunautaires"
        helpLabel={t("beIntraEuHelpLabel")}
        checked={!!draft.be_intra_eu_listing}
        onChange={(b) => update("be_intra_eu_listing", b)}
      />

      {isIndep ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {t("beInastiBox")}
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
  const t = useTranslations("comptaConfig");
  const isCorporate = status === "slu_es" || status === "sl_es" || status === "sa_es";
  const isAutonomo = status === "autonomo_es";
  const community = draft.es_community;
  const isCanarias = isCanariasCommunity(community);
  const isIPSI = isIPSICommunity(community);
  const isForal = isForalCommunity(community);

  const cifLabel = (() => {
    switch (status) {
      case "autonomo_es":
        return t("esCifLabelAutonomo");
      case "slu_es":
        return t("esCifLabelSLU");
      case "sl_es":
        return t("esCifLabelSL");
      case "sa_es":
        return t("esCifLabelSA");
    }
  })();

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
        {t("esImportantBox")}
      </div>

      <div className="space-y-2">
        <Label>{t("esCommunityLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("esCommunityHint")}
        </p>
        <Select
          value={draft.es_community ?? ""}
          onValueChange={(v) => update("es_community", v as EsCommunity)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("esCommunityPlaceholder")} />
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
            {t("esForalNote")}
          </p>
        ) : null}
        {isCanarias ? (
          <p className="text-[11px] text-muted-foreground italic">
            {t("esCanariasNote")}
          </p>
        ) : null}
        {isIPSI ? (
          <p className="text-[11px] text-amber-800 dark:text-amber-200 italic">
            {t("esIpsiNote")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="es-cif">{cifLabel}</Label>
        <p className="text-xs text-muted-foreground">
          {t("esCifHintBefore")}{" "}
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
          {t("startedAtLabel")}{" "}
          <span className="text-muted-foreground font-normal">{t("optional")}</span>
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
          <Label>{t("accountingExerciseLabel")}</Label>
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
              {t("calendarYearShort")}
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
              {t("shifted")}
            </button>
          </div>
          {!draft.sasu_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">{t("fyStartMonthShortLabel")}</Label>
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
                    {monthName(m, t)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isIPSI ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("esIvaRegimeLabel")}{isCanarias ? " (IGIC)" : ""}</Label>
          <p className="text-xs text-muted-foreground">
            {t("esIvaRegimeHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "general", label: t("esRegimeGeneral") },
                { v: "simplificado", label: t("esRegimeSimplificado") },
                { v: "recargo_equivalencia", label: t("esRegimeRecargo") },
                { v: "exencion", label: t("esRegimeExencion") },
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
          <Label>{t("esIvaPeriodicityLabel")}{isCanarias ? " IGIC" : " IVA"}</Label>
          <p className="text-xs text-muted-foreground">
            {t("esIvaPeriodicityHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "trimestral", label: t("esPeriodTrimestral"), hint: t("hintDefault") },
                { v: "mensual", label: t("esPeriodMensual"), hint: t("esHintMensualLarge") },
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
            title={t("esRedemeTitle")}
            desc={t("esRedemeDesc")}
            helpHref="https://sede.agenciatributaria.gob.es/Sede/iva/redeme.html"
            helpLabel={t("esRedemeHelpLabel")}
            checked={!!draft.es_redeme}
            onChange={(b) => update("es_redeme", b)}
          />
        </div>
      ) : null}

      {isAutonomo ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("esIrpfMethodLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("esIrpfMethodHint")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { v: "directa", label: t("esIrpfDirecta"), hint: "Modelo 130" },
                { v: "objetiva", label: t("esIrpfObjetiva"), hint: "Modelo 131" },
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
            {t("esRetaBox")}
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
  const t = useTranslations("comptaConfig");
  const province = draft.ca_province;
  const taxRegime = caTaxRegime(province);
  const isCorporate = status === "inc_provincial_ca" || status === "inc_federal_ca";
  const isAutonome =
    status === "travailleur_autonome_ca" || status === "entreprise_individuelle_ca";
  const isImmatricule = status === "entreprise_individuelle_ca";

  // Étiquette de la taxe affichée à l'user selon la province choisie.
  const taxLabel = (() => {
    if (taxRegime === "tps_tvq") return t("caTaxRegimeQQ");
    if (taxRegime === "tvh") return t("caTaxRegimeTvh");
    if (taxRegime === "tps_pst") {
      return province === "MB" ? "TPS + RST" : "TPS + PST";
    }
    return "TPS";
  })();

  return (
    <Card className="p-4 space-y-4">
      {/* Province / territoire */}
      <div className="space-y-2">
        <Label>{t("caProvinceLabel")}</Label>
        <Select
          value={draft.ca_province ?? ""}
          onValueChange={(v) => update("ca_province", v as CaProvince)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("caProvincePlaceholder")} />
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
            {t("caRegimeLabelPrefix")} <strong>{taxLabel}</strong>.{" "}
            {taxRegime === "tps_tvq" ? (
              <>{t("caRegimeQc")}</>
            ) : taxRegime === "tvh" ? (
              <>{t("caRegimeTvhBefore")}{province === "ON" ? "13 %" : "15 %"}).</>
            ) : taxRegime === "tps_pst" ? (
              <>
                {t("caRegimePstPrefix")} {province === "MB" ? "RST" : "PST"} {t("caRegimePstSuffix")}{" "}
                ({province === "BC" ? "7 %" : province === "SK" ? "6 %" : "7 %"}) {t("caRegimePstDecl")}
              </>
            ) : (
              <>{t("caRegimeNone")}</>
            )}
          </p>
        ) : null}
      </div>

      {/* Numéro d'entreprise */}
      <div className="space-y-2">
        <Label htmlFor="ca-bn">
          {t("caBnLabel")}{" "}
          <span className="text-muted-foreground">
            ({province === "QC" ? t("caBnLabelQC") : t("caBnLabelGen")})
          </span>
        </Label>
        <Input
          id="ca-bn"
          value={draft.ca_business_number ?? ""}
          onChange={(e) => update("ca_business_number", e.target.value || null)}
          placeholder={province === "QC" ? "1234567890 (NEQ) ou 123456789 (BN)" : "123456789"}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("caBnHint")}
        </p>
      </div>

      {/* Date de début */}
      <div className="space-y-2">
        <Label htmlFor="ca-started">{t("caStartedLabel")}</Label>
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
          title={t("caPetitFournisseurTitle")}
          desc={t("caPetitFournisseurDesc")}
          helpHref="https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/tps-tvh-entreprises/inscription-compte-tps-tvh.html"
          helpLabel={t("caPetitFournisseurHelpLabel")}
          checked={!!draft.ca_petit_fournisseur}
          onChange={(b) => update("ca_petit_fournisseur", b)}
        />
      ) : null}

      <BoolRow
        id="ca-gst-registered"
        title={`${t("caGstRegisteredTitlePrefix")} ${taxLabel} ?`}
        desc={
          taxRegime === "tps_tvq"
            ? t("caGstRegisteredDescQQ")
            : t("caGstRegisteredDescGen")
        }
        helpHref="https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/tps-tvh-entreprises.html"
        helpLabel={t("caGstRegisteredHelpLabel")}
        checked={!!draft.ca_gst_registered}
        onChange={(b) => update("ca_gst_registered", b)}
      />

      {/* Périodicité TPS */}
      {draft.ca_gst_registered ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("caGstPeriodicityLabelPrefix")} {taxLabel}</Label>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
            {(
              [
                { v: "annuelle", label: t("caGstPeriodAnnuelle"), hint: t("caHintAnnuelle") },
                { v: "trimestrielle", label: t("caGstPeriodTrim"), hint: t("caHintTrim") },
                { v: "mensuelle", label: t("caGstPeriodMens"), hint: t("caHintMens") },
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
            {t("caGstPeriodFootnote")}
          </p>
        </div>
      ) : null}

      {/* Disclaimer immatriculation REQ pour entreprise individuelle au QC */}
      {isImmatricule && province === "QC" ? (
        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
          {t("caReqBox")}{" "}
          <ExternalLinkRow
            href="https://www.registreentreprises.gouv.qc.ca/"
            label={t("caReqPortalLabel")}
          />
        </div>
      ) : null}

      {/* Exercice comptable pour les sociétés */}
      {isCorporate ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("accountingExerciseLabel")}</Label>
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
              {t("calendarYearShort")}
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
              {t("shifted")}
            </button>
          </div>
          {!draft.ca_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">{t("fyStartMonthShortLabel")}</Label>
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
                    {monthName(m, t)}
                  </option>
                ))}
              </select>
              {errors.ca_fiscal_year_start_month ? (
                <p className="text-xs text-destructive">{errors.ca_fiscal_year_start_month}</p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                {t("caT2Footnote")}
              </p>
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {status === "inc_federal_ca"
              ? t("caFedFootnote")
              : province === "QC"
                ? t("caQcFootnote")
                : t("caProvFootnote")}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function UnitedStatesFields({
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
  const t = useTranslations("comptaConfig");
  const isLLC = status === "single_member_llc_us" || status === "multi_member_llc_us";
  const isSingleLLC = status === "single_member_llc_us";
  const isMultiLLC = status === "multi_member_llc_us";
  const isCorp = status === "c_corp_us" || status === "s_corp_us";
  const stateHasIncomeTax = usHasStateIncomeTax(draft.us_state);
  const stateHasSalesTax = usHasStateSalesTax(draft.us_state);
  const salesTaxStates = draft.us_sales_tax_states ?? [];

  function toggleSalesTaxState(code: UsState) {
    const cur = new Set(salesTaxStates);
    if (cur.has(code)) cur.delete(code);
    else cur.add(code);
    update("us_sales_tax_states", Array.from(cur).sort());
  }

  return (
    <Card className="p-5 space-y-5">
      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
        {t("usImportantBox")}
      </div>

      {/* État principal */}
      <div className="space-y-2">
        <Label>{t("usStateLabel")}</Label>
        <Select
          value={draft.us_state ?? ""}
          onValueChange={(v) => update("us_state", v as UsState)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("usStatePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {US_STATES.map((s) => (
              <SelectItem key={s.code} value={s.code}>
                {s.code} — {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.us_state ? (
          <p className="text-xs text-destructive">{errors.us_state}</p>
        ) : null}
        {draft.us_state ? (
          <p className="text-xs text-muted-foreground">
            {!stateHasIncomeTax ? (
              <>
                <strong>{draft.us_state}</strong> {t("usStateNoIncomeTax")}
              </>
            ) : (
              <>
                <strong>{draft.us_state}</strong> {t("usStateHasIncomeTax")}
              </>
            )}
            {!stateHasSalesTax ? (
              <>
                {" "}{t("usNoSalesTaxNote")}
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {/* EIN */}
      <div className="space-y-2">
        <Label htmlFor="us-ein">
          {t("usEinLabel")} <span className="text-muted-foreground">{t("usEinSuffix")}</span>
        </Label>
        <Input
          id="us-ein"
          value={draft.us_ein ?? ""}
          onChange={(e) => update("us_ein", e.target.value || null)}
          placeholder="XX-XXXXXXX"
        />
        {errors.us_ein ? (
          <p className="text-xs text-destructive">{errors.us_ein}</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {t("usEinHintPrefix")} <code>XX-XXXXXXX</code> {t("usEinHintDigits")}{" "}
          {status === "sole_proprietorship_us" || isSingleLLC ? (
            <>{t("usEinOptional")}</>
          ) : (
            <>{t("usEinRequired")}</>
          )}
        </p>
      </div>

      {/* Date de début */}
      <div className="space-y-2">
        <Label htmlFor="us-started">{t("usStartedLabel")}</Label>
        <Input
          id="us-started"
          type="date"
          value={draft.us_started_at ?? ""}
          onChange={(e) => update("us_started_at", e.target.value || null)}
        />
      </div>

      {/* Élection fiscale LLC */}
      {isLLC ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("usLlcElectionLabel")}</Label>
          <p className="text-[11px] text-muted-foreground">
            {isSingleLLC ? (
              <>{t("usLlcDefaultSingle")}</>
            ) : (
              <>{t("usLlcDefaultMulti")}</>
            )}{" "}
            {t("usLlcElectS")}
          </p>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            {(
              [
                {
                  v: null,
                  label: t("usLlcDefault"),
                  hint: isSingleLLC ? "Schedule C" : "Partnership",
                },
                { v: "s_corp", label: "S-Corp", hint: "Form 2553" },
                { v: "c_corp", label: "C-Corp", hint: "Form 8832" },
                {
                  v: isSingleLLC ? "disregarded" : "partnership",
                  label: t("usLlcExplicit"),
                  hint: isSingleLLC ? "Disregarded" : "Partnership",
                },
              ] as const
            ).map((opt, idx) => {
              const active =
                (draft.us_llc_tax_classification ?? null) === (opt.v ?? null);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    update(
                      "us_llc_tax_classification",
                      (opt.v ?? null) as UsLlcTaxClassification | null,
                    )
                  }
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

      {/* Sales tax states */}
      <div className="space-y-2 pt-3 border-t">
        <Label>{t("usSalesTaxStatesLabel")}</Label>
        <p className="text-[11px] text-muted-foreground">
          {t("usSalesTaxStatesHint")}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 max-h-64 overflow-y-auto p-2 border rounded-md">
          {US_STATES.map((s) => {
            if (!usHasStateSalesTax(s.code)) return null;
            const active = salesTaxStates.includes(s.code);
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => toggleSalesTaxState(s.code)}
                className={`text-xs rounded-md border px-2 py-1.5 transition ${
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted/40"
                }`}
                title={s.label}
              >
                {s.code}
              </button>
            );
          })}
        </div>
        {salesTaxStates.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t("usStatesSelected", {
              n: salesTaxStates.length,
              plural: salesTaxStates.length > 1 ? "s" : "",
              list: salesTaxStates.join(", "),
            })}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t("usStatesNone")}
          </p>
        )}
      </div>

      {/* Disclaimer multi-member partnership */}
      {isMultiLLC ? (
        <div className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs">
          {t("usMultiLlcBox")}
        </div>
      ) : null}

      {/* Disclaimer S-Corp */}
      {status === "s_corp_us" ? (
        <div className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs">
          {t("usSCorpBox")}
        </div>
      ) : null}

      {/* Exercice comptable pour les corporations */}
      {isCorp ? (
        <div className="space-y-2 pt-3 border-t">
          <Label>{t("usFiscalYearLabel")}</Label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => update("us_fiscal_year_calendar", true)}
              className={`text-sm rounded-md border px-3 py-2 ${
                draft.us_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              {t("usCalendarYear")}
            </button>
            <button
              type="button"
              onClick={() => update("us_fiscal_year_calendar", false)}
              className={`text-sm rounded-md border px-3 py-2 ${
                !draft.us_fiscal_year_calendar
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              {t("usFiscalYearShifted")}
            </button>
          </div>
          {!draft.us_fiscal_year_calendar ? (
            <div className="space-y-1 pt-2">
              <Label className="text-xs">{t("fyStartMonthShortLabel")}</Label>
              <select
                value={draft.us_fiscal_year_start_month ?? ""}
                onChange={(e) =>
                  update("us_fiscal_year_start_month", parseInt(e.target.value, 10) || null)
                }
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {monthName(m, t)}
                  </option>
                ))}
              </select>
              {errors.us_fiscal_year_start_month ? (
                <p className="text-xs text-destructive">{errors.us_fiscal_year_start_month}</p>
              ) : null}
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {status === "c_corp_us" ? (
              <>{t("usCCorpFootnote")}</>
            ) : (
              <>{t("usSCorpFootnote")}</>
            )}
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
