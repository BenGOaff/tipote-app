"use client";

// Onglet Compta dans Paramètres — étape 1b.
//
// 4 états successifs (l'user passe de l'un à l'autre au fur et à mesure
// qu'il configure) :
//
//   1. country vide              → CountryGateForm
//   2. country ≠ France          → UnsupportedCountry
//   3. France + statut non set   → ComptaConfigForm (choix + sous-config)
//   4. France + statut configuré → SummaryAndPlaceholder (résumé +
//      bouton "Modifier" + listing des fonctionnalités à venir)
//
// Le vrai dashboard (CA, alertes seuils, calendrier fiscal, exports)
// arrive dans les sous-commits 1c → 1e. Pour l'instant on prépare la
// porte d'entrée et on collecte les infos nécessaires.

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Globe, Loader2, ShieldCheck, Sparkles, Pencil, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  COUNTRY_OPTIONS,
  isFrenchCountry,
  isSwissCountry,
  isPortugueseCountry,
  isBelgianCountry,
  isSpanishCountry,
  isCanadianCountry,
  isAmericanCountry,
  SUPPORTED_COUNTRIES,
} from "@/lib/compta/countries";
import {
  type AccountingStatus,
  type ComptaProfileSlice,
  emptyComptaSlice,
  ES_COMMUNITIES,
  isCanariasCommunity,
  isIPSICommunity,
  isForalCommunity,
  CA_PROVINCES,
  caTaxRegime,
  caTotalTaxRate,
  US_STATES,
  usHasStateIncomeTax,
} from "@/lib/compta/types";
import ComptaConfigForm from "@/components/settings/ComptaConfigForm";
import ComptaConnections from "@/components/settings/ComptaConnections";
import ComptaManualTransactions from "@/components/settings/ComptaManualTransactions";
import { ComptaExpenseItems } from "@/components/settings/ComptaExpenseItems";
import ComptaDashboard from "@/components/settings/ComptaDashboard";
import { FiscalCalendar } from "@/components/settings/FiscalCalendar";
import { FecExportCard } from "@/components/settings/FecExportCard";
import RevenueGoalProgress from "@/components/business/RevenueGoalProgress";

interface Props {
  /** Slice du profil business courant. Tous les champs sont optionnels —
   *  un profil neuf vit avec toutes les valeurs à null/false. */
  profile: ComptaProfileSlice | null;
  /** Appelé après chaque sauvegarde réussie, avec le profil refresh
   *  renvoyé par /api/profile. Le parent met à jour son état. */
  onProfileUpdated: (next: ComptaProfileSlice) => void;
}

export default function ComptaTab({ profile, onProfileUpdated }: Props) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  const slice: ComptaProfileSlice = { ...emptyComptaSlice(), ...(profile ?? {}) };
  const { country, accounting_status: status } = slice;

  const hasCountry = (country ?? "").trim().length > 0;
  const isFrance = isFrenchCountry(country);
  const isSwiss = isSwissCountry(country);
  const isPortugal = isPortugueseCountry(country);
  const isBelgium = isBelgianCountry(country);
  const isSpain = isSpanishCountry(country);
  const isCanada = isCanadianCountry(country);
  const isUSA = isAmericanCountry(country);
  const isSupported = isFrance || isSwiss || isPortugal || isBelgium || isSpain || isCanada || isUSA;

  function patchProfile(patch: Partial<ComptaProfileSlice>): Promise<void> {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const res = await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const json = (await res.json().catch(() => null)) as
            | { ok?: boolean; profile?: ComptaProfileSlice; error?: string }
            | null;
          if (!json?.ok) throw new Error(json?.error ?? "Erreur");
          if (json.profile) {
            onProfileUpdated({ ...emptyComptaSlice(), ...json.profile });
          }
          setEditing(false);
        } catch (e) {
          toast({
            title: "Oups",
            description: e instanceof Error ? e.message : "Impossible d'enregistrer",
            variant: "destructive",
          });
        } finally {
          resolve();
        }
      });
    });
  }

  return (
    <div className="space-y-6">
      <DisclaimerBanner />

      {!hasCountry ? (
        <CountryGateForm
          pending={pending}
          onSave={(c) => patchProfile({ country: c })}
        />
      ) : !isSupported ? (
        <UnsupportedCountry
          country={country!}
          pending={pending}
          onSave={(c) => patchProfile({ country: c })}
        />
      ) : !status || editing ? (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-lg">
                {editing ? "Modifier ma configuration" : "Configure ta compta"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Pour t&apos;aider à anticiper tes seuils, échéances et
                déclarations, dis-moi sous quel statut tu exerces.
              </p>
            </div>
          </div>
          <ComptaConfigForm
            initial={slice}
            country={isFrance ? "FR" : isSwiss ? "CH" : isPortugal ? "PT" : isBelgium ? "BE" : isSpain ? "ES" : isCanada ? "CA" : "US"}
            pending={pending}
            onSave={patchProfile}
            onCancel={editing ? () => setEditing(false) : undefined}
          />
        </Card>
      ) : (
        <ConfiguredSummary slice={slice} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Bandeau permanent "Tipote ≠ comptable"
 * ────────────────────────────────────────────────────────────────── */

function DisclaimerBanner() {
  return (
    <Card className="p-6 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
            Tipote t&apos;aide à anticiper, pas à déclarer.
          </p>
          <p className="text-sm text-amber-900/80 leading-relaxed">
            Cet onglet agrège tes encaissements (Stripe, PayPal, Mollie,
            Systeme.io…) et te prévient sur les seuils, échéances et
            documents à préparer. <strong>Il ne remplace ni un·e
            comptable, ni les déclarations officielles</strong> sur{" "}
            <a
              href="https://www.impots.gouv.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-700"
            >
              impots.gouv.fr
            </a>{" "}
            et{" "}
            <a
              href="https://www.urssaf.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-700"
            >
              urssaf.fr
            </a>. Vérifie toujours tes chiffres avant de déclarer.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Sélecteur de pays
 * ────────────────────────────────────────────────────────────────── */

function CountryGateForm({
  pending,
  onSave,
}: {
  pending: boolean;
  onSave: (country: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [otherText, setOtherText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft === "Autre" ? otherText.trim() : draft;
    if (!value) return;
    onSave(value);
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Globe className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-lg">Tu vis dans quel pays ?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            La compta dépend du pays (régimes, seuils, calendrier
            fiscal…). Choisis le tien pour voir les bonnes infos.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="compta-country">Pays de résidence</Label>
          <select
            id="compta-country"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          >
            <option value="">Sélectionne…</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {draft === "Autre" ? (
          <div className="space-y-2">
            <Label htmlFor="compta-country-other">Précise ton pays</Label>
            <Input
              id="compta-country-other"
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              disabled={pending}
              placeholder="Ex : Norvège"
              required
              maxLength={120}
            />
          </div>
        ) : null}

        <Button type="submit" disabled={pending || !draft}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enregistrement…
            </>
          ) : (
            "Continuer"
          )}
        </Button>
      </form>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Pays non supporté
 * ────────────────────────────────────────────────────────────────── */

function UnsupportedCountry({
  country,
  pending,
  onSave,
}: {
  country: string;
  pending: boolean;
  onSave: (country: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const supportedLabels = SUPPORTED_COUNTRIES.map((c) => c.label).join(", ");

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Globe className="h-6 w-6 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-lg">
            Bientôt disponible pour {country}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            L&apos;aide compta Tipote n&apos;est aujourd&apos;hui
            disponible que pour : <strong>{supportedLabels}</strong>.
            On ouvre les autres pays un par un — Belgique, Suisse,
            Québec, Portugal, Espagne… arrivent.
          </p>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            <strong>Pas besoin de t&apos;inscrire à une liste</strong> :
            tu seras prévenu·e par email dès que ton pays est ouvert,
            on t&apos;identifie automatiquement.
          </p>
        </div>
      </div>

      <div className="border-t pt-4">
        {editing ? (
          <CountryGateForm pending={pending} onSave={onSave} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Mauvais pays ? Corriger
          </button>
        )}
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Résumé après config + placeholder
 * ────────────────────────────────────────────────────────────────── */

function ConfiguredSummary({
  slice,
  onEdit,
}: {
  slice: ComptaProfileSlice;
  onEdit: () => void;
}) {
  const status = slice.accounting_status as AccountingStatus;
  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              Mon statut
            </p>
            <h3 className="font-semibold text-lg mt-1">{statusLabel(status)}</h3>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Modifier
          </Button>
        </div>
        <SummaryDetails slice={slice} />
      </Card>

      {/* Progression vers l'objectif mensuel — connecté au CA réel
          (transactions PSP + saisies manuelles + fallback offer_metrics). */}
      <RevenueGoalProgress />

      {/* Tableau de bord business — CA mois/an, MRR, churn, top produits (1f) */}
      <ComptaDashboard />

      {/* Section "Mes connexions" — Stripe + PayPal + Mollie (phases 1c/1d) */}
      <ComptaConnections />

      {/* Section "Saisies manuelles" — virements / espèces / chèques (1e) */}
      <ComptaManualTransactions />

      {/* Achats / charges + TVA déductible (1k) — pour calculer la
          vraie TVA à payer (collectée - déductible) et nourrir le
          FEC en écritures d'achat. */}
      <ComptaExpenseItems />

      {/* Calendrier fiscal personnalisé (1i) — URSSAF / TVA / IS / IR /
          CFE / DSN selon le statut. Lit /api/compta/fiscal-deadlines. */}
      <FiscalCalendar />

      {/* Export FEC — uniquement pour les sociétés FRANÇAISES à l'IS
          (le format FEC est défini par le LPF français art. A47 A-1).
          Les Sàrl/SA suisses, LDA portugaises et SRL belges ont leurs
          propres obligations comptables (Code des Obligations en CH,
          PCMN en BE, normalisé via SAF-T en PT) — pas de FEC à
          produire. Les statuts sasu/sas/sarl/eurl sont FR-only par
          définition, donc tester le statut suffit. */}
      {status === "sasu" || status === "sas" || status === "sarl" || status === "eurl" ? (
        <FecExportCard hasSiren={Boolean(slice.sasu_siren)} />
      ) : null}
    </div>
  );
}

function SummaryDetails({ slice }: { slice: ComptaProfileSlice }) {
  const rows: Array<{ label: string; value: string; href?: string; hrefLabel?: string }> = [];

  if (slice.accounting_status === "particulier") {
    rows.push({
      label: "Nature des revenus",
      value: particulierRevenueLabel(slice.particulier_revenue_type),
      href: "https://www.impots.gouv.fr/particulier/professions-non-salariees-revenus-fonciers-pme",
      hrefLabel: "Aide impots.gouv.fr",
    });
  } else if (slice.accounting_status === "auto_entrepreneur") {
    rows.push({ label: "Activité", value: aeActivityLabel(slice.ae_activity_type) });
    rows.push({ label: "Début d'activité", value: slice.ae_started_at ?? "Non renseigné" });
    rows.push({ label: "ACRE", value: slice.ae_acre ? "Oui" : "Non" });
    rows.push({
      label: "Versement libératoire",
      value: slice.ae_versement_liberatoire ? "Oui" : "Non",
    });
    rows.push({
      label: "Franchise TVA",
      value: slice.ae_vat_franchise ? "Oui" : "Non (TVA collectée)",
    });
    rows.push({
      label: "Déclaration URSSAF",
      value:
        slice.ae_urssaf_periodicity === "mensuelle"
          ? "Mensuelle"
          : "Trimestrielle (par défaut)",
    });
  } else if (
    slice.accounting_status === "sasu" ||
    slice.accounting_status === "sas" ||
    slice.accounting_status === "sarl" ||
    slice.accounting_status === "eurl"
  ) {
    // Toutes les sociétés partagent les mêmes lignes de résumé
    // (SIREN, exercice, TVA), avec en plus quelques spécificités
    // par forme juridique.
    const statusLabel =
      slice.accounting_status === "sasu"
        ? "SASU"
        : slice.accounting_status === "sas"
          ? "SAS"
          : slice.accounting_status === "sarl"
            ? "SARL"
            : "EURL";
    rows.push({ label: "Forme juridique", value: statusLabel });

    rows.push({
      label: "SIREN",
      value: slice.sasu_siren ?? "Non renseigné",
      href: slice.sasu_siren
        ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${slice.sasu_siren}`
        : undefined,
      hrefLabel: "Voir sur annuaire-entreprises",
    });

    if (slice.accounting_status === "eurl") {
      rows.push({
        label: "Régime fiscal",
        value: slice.eurl_is_election ? "IS (sur option)" : "IR (par défaut)",
      });
    }
    if (slice.accounting_status === "sarl") {
      rows.push({
        label: "Statut du gérant",
        value: slice.sarl_gerant_majoritaire
          ? "Majoritaire (TNS — pas de DSN)"
          : "Minoritaire / égalitaire (assimilé salarié)",
      });
    }

    rows.push({
      label: "Exercice fiscal",
      value: slice.sasu_fiscal_year_calendar
        ? "Année civile (jan → déc)"
        : `Décalé (début ${monthLabel(slice.sasu_fiscal_year_start_month)})`,
    });
    rows.push({ label: "Régime TVA", value: vatRegimeLabel(slice.sasu_vat_regime) });
    rows.push({
      label: "TVA intracommunautaire",
      value: slice.sasu_vat_intra_enabled ? "Activée (DES requise)" : "Non",
    });
    // Dirigeant rémunéré : seulement pertinent si le statut social
    // est assimilé salarié. Pour SARL gérant majoritaire / EURL-IR,
    // on affiche TNS à la place.
    const isAssimile =
      slice.accounting_status === "sasu" ||
      slice.accounting_status === "sas" ||
      (slice.accounting_status === "sarl" && !slice.sarl_gerant_majoritaire) ||
      (slice.accounting_status === "eurl" && slice.eurl_is_election);
    if (isAssimile) {
      rows.push({
        label: "Dirigeant rémunéré",
        value: slice.sasu_dirigeant_remunere
          ? "Oui (URSSAF + DSN)"
          : "Non (dividendes uniquement)",
      });
    } else {
      rows.push({
        label: "Régime social",
        value: "TNS — cotisations URSSAF travailleur indépendant",
      });
    }
  } else if (
    slice.accounting_status === "independant_ch" ||
    slice.accounting_status === "sarl_ch" ||
    slice.accounting_status === "sa_ch"
  ) {
    // Suisse — résumé adapté au statut + canton
    const chLabel =
      slice.accounting_status === "independant_ch"
        ? "Indépendant (raison individuelle)"
        : slice.accounting_status === "sarl_ch"
          ? "Sàrl"
          : "SA";
    rows.push({ label: "Forme juridique", value: chLabel });
    rows.push({
      label: "Canton",
      value: slice.ch_canton ?? "Non précisé",
    });
    rows.push({
      label: "Assujetti TVA",
      value: slice.ch_vat_assujetti
        ? "Oui (CA > 100'000 CHF/an)"
        : "Non (sous le seuil)",
    });
    if (slice.ch_vat_assujetti) {
      rows.push({
        label: "Périodicité TVA",
        value:
          slice.ch_vat_periodicity === "mensuelle"
            ? "Mensuelle"
            : slice.ch_vat_periodicity === "semestrielle"
              ? "Semestrielle"
              : slice.ch_vat_periodicity === "annuelle"
                ? "Annuelle"
                : "Trimestrielle (par défaut)",
      });
      rows.push({
        label: "Méthode TVA",
        value:
          slice.ch_vat_method === "tdfn"
            ? "Taux de la dette fiscale nette (TDFN)"
            : "Effective (par défaut)",
      });
    }
    if (slice.accounting_status === "independant_ch") {
      rows.push({
        label: "AVS / cotisations sociales",
        value: "Acomptes trimestriels via ta caisse cantonale",
      });
    }
    if (slice.accounting_status === "sarl_ch" || slice.accounting_status === "sa_ch") {
      rows.push({
        label: "Comptes annuels",
        value: "AG d'approbation dans les 6 mois après clôture",
      });
    }
  } else if (
    slice.accounting_status === "trabalhador_independente_pt" ||
    slice.accounting_status === "eni_pt" ||
    slice.accounting_status === "lda_unipessoal_pt" ||
    slice.accounting_status === "lda_pt" ||
    slice.accounting_status === "sa_pt"
  ) {
    // Portugal — résumé adapté en français (UI Tipote francophone),
    // termes officiels portugais conservés (NIF, IRS, IRC, etc.)
    const ptLabel =
      slice.accounting_status === "trabalhador_independente_pt"
        ? "Trabalhador independente"
        : slice.accounting_status === "eni_pt"
          ? "Empresário em Nome Individual (ENI)"
          : slice.accounting_status === "lda_unipessoal_pt"
            ? "Sociedade Unipessoal por Quotas (LDA Unipessoal)"
            : slice.accounting_status === "lda_pt"
              ? "Sociedade por Quotas (LDA)"
              : "Sociedade Anónima (SA)";
    rows.push({ label: "Forme juridique", value: ptLabel });
    rows.push({
      label: "NIF",
      value: slice.pt_nif ?? "Non renseigné",
    });
    const regionLabel =
      slice.pt_region === "madeira"
        ? "Madeira (taux IVA réduits)"
        : slice.pt_region === "acores"
          ? "Açores (taux IVA réduits)"
          : slice.pt_region === "continente"
            ? "Portugal continental"
            : "Non précisé";
    rows.push({ label: "Région", value: regionLabel });
    rows.push({
      label: "Régime IVA",
      value: slice.pt_iva_isento
        ? "Isento (sous le seuil 15 000 €)"
        : "Normal (assujetti)",
    });
    if (!slice.pt_iva_isento) {
      rows.push({
        label: "Périodicité IVA",
        value:
          slice.pt_iva_periodicity === "mensal"
            ? "Mensuelle"
            : "Trimestrielle (par défaut)",
      });
    }
    if (
      slice.accounting_status === "trabalhador_independente_pt" ||
      slice.accounting_status === "eni_pt"
    ) {
      rows.push({
        label: "Régime fiscal",
        value:
          slice.pt_tax_regime === "organizada"
            ? "Contabilidade organizada (réelle)"
            : "Simplificado (forfaitaire)",
      });
      rows.push({
        label: "Segurança Social",
        value: "Paiement mensuel le 20 (21,4% du revenu pertinente)",
      });
    }
  } else if (
    slice.accounting_status === "independant_principal_be" ||
    slice.accounting_status === "independant_complementaire_be" ||
    slice.accounting_status === "srl_be" ||
    slice.accounting_status === "sa_be"
  ) {
    // Belgique — résumé en français, noms officiels conservés
    // (BCE, INASTI/RSVZ, BNB, Tax-on-web, Biztax, Intervat).
    const beLabel =
      slice.accounting_status === "independant_principal_be"
        ? "Indépendant à titre principal"
        : slice.accounting_status === "independant_complementaire_be"
          ? "Indépendant à titre complémentaire"
          : slice.accounting_status === "srl_be"
            ? "Société à Responsabilité Limitée (SRL)"
            : "Société Anonyme (SA)";
    rows.push({ label: "Forme juridique", value: beLabel });
    rows.push({
      label: "Numéro BCE",
      value: slice.be_company_number ?? "Non renseigné",
      href: slice.be_company_number
        ? `https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?nummer=${slice.be_company_number}`
        : undefined,
      hrefLabel: "Voir sur la BCE",
    });
    const regionLabel =
      slice.be_region === "wallonie"
        ? "Wallonie"
        : slice.be_region === "flandre"
          ? "Flandre"
          : slice.be_region === "bruxelles"
            ? "Bruxelles-Capitale"
            : "Non précisé";
    rows.push({ label: "Région", value: regionLabel });
    rows.push({
      label: "Régime TVA",
      value: slice.be_vat_franchise
        ? "Franchise (CA < 25 000 €/an)"
        : "Assujetti — déclarations TVA via Intervat",
    });
    if (!slice.be_vat_franchise) {
      rows.push({
        label: "Périodicité TVA",
        value:
          slice.be_vat_periodicity === "mensuelle"
            ? "Mensuelle (CA > 2,5 M€)"
            : "Trimestrielle (par défaut)",
      });
    }
    rows.push({
      label: "Listing intra-UE (état 723)",
      value: slice.be_intra_eu_listing ? "Activé (déclaration trimestrielle)" : "Non",
    });
    if (
      slice.accounting_status === "independant_principal_be" ||
      slice.accounting_status === "independant_complementaire_be"
    ) {
      rows.push({
        label: "Cotisations INASTI/RSVZ",
        value:
          slice.accounting_status === "independant_complementaire_be"
            ? "Acomptes trimestriels (taux réduit, activité complémentaire)"
            : "Acomptes trimestriels (20,5% du revenu net)",
      });
    }
    if (slice.accounting_status === "srl_be" || slice.accounting_status === "sa_be") {
      rows.push({
        label: "Comptes annuels",
        value: "Dépôt à la BNB dans les 7 mois après l'AG",
      });
    }
  } else if (
    slice.accounting_status === "autonomo_es" ||
    slice.accounting_status === "slu_es" ||
    slice.accounting_status === "sl_es" ||
    slice.accounting_status === "sa_es"
  ) {
    // Espagne — résumé en français, noms officiels conservés
    // (NIF/CIF, AEAT, Modelo 100/130/200/202/303/349, RETA, IGIC, etc.)
    const esLabel =
      slice.accounting_status === "autonomo_es"
        ? "Trabajador autónomo"
        : slice.accounting_status === "slu_es"
          ? "Sociedad Limitada Unipersonal (SLU)"
          : slice.accounting_status === "sl_es"
            ? "Sociedad Limitada (SL)"
            : "Sociedad Anónima (SA)";
    rows.push({ label: "Forme juridique", value: esLabel });

    const ccaaLabel = (() => {
      const found = slice.es_community
        ? ES_COMMUNITIES.find((c) => c.code === slice.es_community)
        : null;
      return found?.label ?? "Non précisée";
    })();
    rows.push({ label: "Comunidad Autónoma", value: ccaaLabel });

    rows.push({
      label: slice.accounting_status === "autonomo_es" ? "NIF / DNI" : "CIF",
      value: slice.es_company_number ?? "Non renseigné",
    });

    if (isIPSICommunity(slice.es_community)) {
      rows.push({
        label: "Régime indirect",
        value: "IPSI (hors scope MVP Tipote)",
      });
    } else {
      const ivaTax = isCanariasCommunity(slice.es_community) ? "IGIC" : "IVA";
      const ivaRegimeLabel =
        slice.es_iva_regime === "general"
          ? "General"
          : slice.es_iva_regime === "simplificado"
            ? "Simplificado"
            : slice.es_iva_regime === "recargo_equivalencia"
              ? "Recargo de equivalencia"
              : slice.es_iva_regime === "exencion"
                ? "Exención"
                : "Non précisé";
      rows.push({ label: `Régime ${ivaTax}`, value: ivaRegimeLabel });
      if (slice.es_iva_regime && slice.es_iva_regime !== "exencion") {
        rows.push({
          label: `Périodicité ${ivaTax}`,
          value:
            slice.es_iva_periodicity === "mensual"
              ? "Mensual (CA > 6 M€ ou REDEME)"
              : "Trimestral (par défaut)",
        });
        if (slice.es_redeme) {
          rows.push({
            label: "REDEME",
            value: "Inscrit (déclarations IVA mensuelles)",
          });
        }
      }
    }

    if (isForalCommunity(slice.es_community)) {
      rows.push({
        label: "Hacienda compétente",
        value:
          slice.es_community === "PV"
            ? "Hacienda Foral País Vasco (Régimen Foral)"
            : "Hacienda Foral Navarra (Régimen Foral)",
      });
    }

    if (slice.accounting_status === "autonomo_es") {
      rows.push({
        label: "Méthode IRPF",
        value:
          slice.es_irpf_method === "objetiva"
            ? "Módulos (Modelo 131)"
            : "Estimación directa (Modelo 130)",
      });
      rows.push({
        label: "RETA",
        value: "Cotisations mensuelles via TGSS (basées sur revenus réels)",
      });
    }

    if (
      slice.accounting_status === "slu_es" ||
      slice.accounting_status === "sl_es" ||
      slice.accounting_status === "sa_es"
    ) {
      rows.push({
        label: "Exercice fiscal",
        value: slice.sasu_fiscal_year_calendar
          ? "Année civile (jan → déc)"
          : `Décalé (début ${monthLabel(slice.sasu_fiscal_year_start_month)})`,
      });
      rows.push({
        label: "Comptes annuels",
        value: "Dépôt au Registro Mercantil dans le mois suivant l'AG",
      });
    }
  } else if (
    slice.accounting_status === "travailleur_autonome_ca" ||
    slice.accounting_status === "entreprise_individuelle_ca" ||
    slice.accounting_status === "inc_provincial_ca" ||
    slice.accounting_status === "inc_federal_ca"
  ) {
    // Canada — résumé en français, noms officiels conservés
    // (TPS/TVQ/TVH/PST, T1/TP-1, T2/CO-17, BN, NEQ, ARC, RQ, RRQ, RPC,
    // RQAP, REQ, etc.)
    const caLabel =
      slice.accounting_status === "travailleur_autonome_ca"
        ? "Travailleur autonome"
        : slice.accounting_status === "entreprise_individuelle_ca"
          ? "Entreprise individuelle (immatriculée)"
          : slice.accounting_status === "inc_provincial_ca"
            ? "Société par actions provinciale (Inc.)"
            : "Société par actions fédérale (Inc., CBCA)";
    rows.push({ label: "Forme juridique", value: caLabel });

    if (slice.ca_province) {
      const provLabel = CA_PROVINCES.find((p) => p.code === slice.ca_province)?.label ??
        slice.ca_province;
      rows.push({ label: "Province / territoire", value: provLabel });

      const regime = caTaxRegime(slice.ca_province);
      const rate = caTotalTaxRate(slice.ca_province);
      const regimeLabel =
        regime === "tps_tvq"
          ? `TPS + TVQ (${rate.toFixed(3).replace(/\.?0+$/, "")} % combinés)`
          : regime === "tvh"
            ? `TVH harmonisée (${rate} %)`
            : regime === "tps_pst"
              ? `TPS 5 % + ${slice.ca_province === "MB" ? "RST" : "PST"} ${rate - 5} %`
              : "TPS 5 % seule (pas de taxe provinciale)";
      rows.push({ label: "Régime de taxes", value: regimeLabel });
    }

    if (slice.ca_business_number) {
      rows.push({
        label: slice.ca_province === "QC" ? "BN ARC / NEQ" : "Business Number ARC",
        value: slice.ca_business_number,
      });
    }

    if (slice.ca_started_at) {
      rows.push({ label: "Date de début", value: slice.ca_started_at });
    }

    if (slice.ca_gst_registered) {
      const period =
        (slice.ca_gst_periodicity ?? "annuelle") === "mensuelle"
          ? "Mensuelle"
          : slice.ca_gst_periodicity === "trimestrielle"
            ? "Trimestrielle"
            : "Annuelle";
      const taxName =
        caTaxRegime(slice.ca_province) === "tps_tvq" ? "TPS + TVQ" :
        caTaxRegime(slice.ca_province) === "tvh" ? "TVH" : "TPS";
      rows.push({
        label: "Inscription taxes",
        value: `${taxName} — ${period.toLowerCase()}`,
        href: slice.ca_province === "QC"
          ? "https://www.revenuquebec.ca/fr/entreprises/taxes/tps-tvh-et-tvq/"
          : "https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/tps-tvh-entreprises.html",
        hrefLabel: slice.ca_province === "QC" ? "Revenu Québec" : "ARC",
      });
    } else {
      rows.push({
        label: "Inscription TPS",
        value: slice.ca_petit_fournisseur
          ? "Non inscrit (petit fournisseur, CA < 30 000 $)"
          : "Non inscrit",
      });
    }

    if (
      slice.accounting_status === "travailleur_autonome_ca" ||
      slice.accounting_status === "entreprise_individuelle_ca"
    ) {
      rows.push({
        label: "Impôt particulier",
        value: slice.ca_province === "QC"
          ? "T1 (ARC) + TP-1 (Revenu Québec) — production 15 juin, paiement 30 avril"
          : "T1 (ARC) — production 15 juin, paiement 30 avril",
      });
      rows.push({
        label: "Acomptes provisionnels",
        value: "Trimestriels (15 mars / juin / sept / déc) si impôt > 3 000 $/an",
      });
      rows.push({
        label: slice.ca_province === "QC" ? "RRQ + RQAP" : "RPC",
        value: "Cotisations payées avec le T1 annuel",
      });
    }

    if (
      slice.accounting_status === "inc_provincial_ca" ||
      slice.accounting_status === "inc_federal_ca"
    ) {
      const fyLabel = slice.ca_fiscal_year_calendar
        ? "Année civile (clôture 31 décembre)"
        : slice.ca_fiscal_year_start_month
          ? `Décalé (début mois ${slice.ca_fiscal_year_start_month})`
          : "À configurer";
      rows.push({ label: "Exercice comptable", value: fyLabel });
      rows.push({
        label: "Impôt société",
        value: slice.ca_province === "QC"
          ? "T2 (ARC) + CO-17 (RQ) — production 6 mois après clôture, paiement 2 mois (3 si SPCC admissible DPE)"
          : "T2 (ARC) — production 6 mois après clôture, paiement 2 mois (3 si SPCC admissible DPE)",
      });
      rows.push({
        label: "DAS (si employés)",
        value: slice.ca_province === "QC"
          ? "Mensuelles : ARC (RPC/AE/impôt) + Revenu Québec (RRQ/RQAP/FSS/impôt)"
          : "Mensuelles à l'ARC (RPC/AE/impôt fédéral)",
      });
      if (slice.accounting_status === "inc_federal_ca") {
        rows.push({
          label: "Registre fédéral",
          value: "Mise à jour annuelle Corporations Canada (anniversaire)",
          href: "https://www.ic.gc.ca/eic/site/cd-dgc.nsf/fra/accueil",
          hrefLabel: "Corporations Canada",
        });
      }
    }
  } else if (
    slice.accounting_status === "sole_proprietorship_us" ||
    slice.accounting_status === "single_member_llc_us" ||
    slice.accounting_status === "multi_member_llc_us" ||
    slice.accounting_status === "c_corp_us" ||
    slice.accounting_status === "s_corp_us"
  ) {
    // États-Unis — résumé en français, noms officiels conservés
    // (Forms 1040/1120/1120-S/1065/1040-ES/1099-NEC, EIN, Schedule C,
    // K-1, IRS, Sales tax, etc.)
    const usLabel =
      slice.accounting_status === "sole_proprietorship_us"
        ? "Sole proprietorship"
        : slice.accounting_status === "single_member_llc_us"
          ? "Single-member LLC"
          : slice.accounting_status === "multi_member_llc_us"
            ? "Multi-member LLC"
            : slice.accounting_status === "c_corp_us"
              ? "C-Corp (C Corporation)"
              : "S-Corp (S Corporation)";
    rows.push({ label: "Forme juridique", value: usLabel });

    if (slice.us_state) {
      const stateLabel = US_STATES.find((s) => s.code === slice.us_state)?.label ??
        slice.us_state;
      rows.push({
        label: "État",
        value: `${slice.us_state} — ${stateLabel}`,
      });
      rows.push({
        label: "State income tax",
        value: usHasStateIncomeTax(slice.us_state)
          ? "Oui (déclaration parallèle au 1040 fédéral)"
          : "Non — état sans state income tax sur business",
      });
    }

    if (slice.us_ein) {
      rows.push({ label: "EIN", value: slice.us_ein });
    }

    if (slice.us_started_at) {
      rows.push({ label: "Date de début", value: slice.us_started_at });
    }

    // Élection LLC
    if (
      slice.accounting_status === "single_member_llc_us" ||
      slice.accounting_status === "multi_member_llc_us"
    ) {
      const classif = slice.us_llc_tax_classification;
      const classifLabel =
        classif === "s_corp"
          ? "S-Corp (Form 2553)"
          : classif === "c_corp"
            ? "C-Corp (Form 8832)"
            : classif === "partnership"
              ? "Partnership (Form 1065)"
              : classif === "disregarded"
                ? "Disregarded entity (Schedule C)"
                : slice.accounting_status === "single_member_llc_us"
                  ? "Disregarded entity (défaut, Schedule C)"
                  : "Partnership (défaut, Form 1065)";
      rows.push({ label: "Élection fiscale", value: classifLabel });
    }

    // Forms à produire selon le statut effectif
    if (slice.accounting_status === "sole_proprietorship_us") {
      rows.push({
        label: "Forms fédérales",
        value: "1040 + Schedule C, 1040-ES (estimated taxes Q1-Q4), Self-employment tax 15,3 %",
        href: "https://www.irs.gov/forms-pubs/about-form-1040",
        hrefLabel: "IRS Form 1040",
      });
    } else if (slice.accounting_status === "c_corp_us" ||
               slice.us_llc_tax_classification === "c_corp") {
      rows.push({
        label: "Forms fédérales",
        value: "1120 (15 avril en calendar year), 1120-W estimated tax (15 mars/juin/sept/déc)",
        href: "https://www.irs.gov/forms-pubs/about-form-1120",
        hrefLabel: "IRS Form 1120",
      });
    } else if (slice.accounting_status === "s_corp_us" ||
               slice.us_llc_tax_classification === "s_corp") {
      rows.push({
        label: "Forms fédérales",
        value: "1120-S + K-1 (15 mars en calendar year), pass-through aux shareholders",
        href: "https://www.irs.gov/forms-pubs/about-form-1120-s",
        hrefLabel: "IRS Form 1120-S",
      });
    } else if (slice.accounting_status === "multi_member_llc_us") {
      rows.push({
        label: "Forms fédérales",
        value: "1065 + K-1 (15 mars en calendar year), pass-through aux members",
        href: "https://www.irs.gov/forms-pubs/about-form-1065",
        hrefLabel: "IRS Form 1065",
      });
    } else {
      // single-member LLC disregarded (default)
      rows.push({
        label: "Forms fédérales",
        value: "1040 + Schedule C (LLC ignorée fiscalement), 1040-ES, Self-employment tax 15,3 %",
        href: "https://www.irs.gov/forms-pubs/about-form-1040",
        hrefLabel: "IRS Form 1040",
      });
    }

    // 1099-NEC pour tous les business
    rows.push({
      label: "1099-NEC contractors",
      value: "À émettre 31 janvier pour chaque contractor payé > 600 $/an",
      href: "https://www.irs.gov/forms-pubs/about-form-1099-nec",
      hrefLabel: "IRS Form 1099-NEC",
    });

    // Sales tax
    const salesTaxStates = slice.us_sales_tax_states ?? [];
    if (salesTaxStates.length > 0) {
      rows.push({
        label: "Sales tax",
        value: `Inscrit dans ${salesTaxStates.length} état${salesTaxStates.length > 1 ? "s" : ""} : ${salesTaxStates.join(", ")} (rappel mensuel le 20)`,
      });
    } else {
      rows.push({
        label: "Sales tax",
        value: "Aucun état d'inscription",
      });
    }

    // Annual report pour les entités
    if (slice.accounting_status !== "sole_proprietorship_us") {
      rows.push({
        label: "Annual report",
        value: `Dépôt auprès du Secretary of State ${slice.us_state ?? ""} (date variable selon l'état)`,
      });
    }

    // Exercice fiscal pour les corporations
    if (
      slice.accounting_status === "c_corp_us" ||
      slice.accounting_status === "s_corp_us"
    ) {
      const fyLabel = slice.us_fiscal_year_calendar
        ? "Calendar year (clôture 31 décembre)"
        : slice.us_fiscal_year_start_month
          ? `Fiscal year décalé (début mois ${slice.us_fiscal_year_start_month})`
          : "À configurer";
      rows.push({ label: "Exercice fiscal", value: fyLabel });
    }
  }

  return (
    <dl className="text-sm divide-y border-t border-b">
      {rows.map((row, i) => (
        <div key={i} className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium text-right flex items-center gap-2">
            <span>{row.value}</span>
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-0.5"
                title={row.hrefLabel}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers de labels
 * ────────────────────────────────────────────────────────────────── */

function statusLabel(s: AccountingStatus): string {
  switch (s) {
    case "particulier":
      return "Particulier";
    case "auto_entrepreneur":
      return "Auto-entrepreneur";
    case "sasu":
      return "SASU";
    case "sas":
      return "SAS";
    case "sarl":
      return "SARL";
    case "eurl":
      return "EURL";
    case "independant_ch":
      return "Indépendant (Suisse)";
    case "sarl_ch":
      return "Sàrl (Suisse)";
    case "sa_ch":
      return "SA (Suisse)";
    case "trabalhador_independente_pt":
      return "Trabalhador independente (Portugal)";
    case "eni_pt":
      return "ENI (Portugal)";
    case "lda_unipessoal_pt":
      return "LDA Unipessoal (Portugal)";
    case "lda_pt":
      return "LDA (Portugal)";
    case "sa_pt":
      return "SA (Portugal)";
    case "independant_principal_be":
      return "Indépendant à titre principal (Belgique)";
    case "independant_complementaire_be":
      return "Indépendant à titre complémentaire (Belgique)";
    case "srl_be":
      return "SRL (Belgique)";
    case "sa_be":
      return "SA (Belgique)";
    case "autonomo_es":
      return "Autónomo (Espagne)";
    case "slu_es":
      return "SLU (Espagne)";
    case "sl_es":
      return "SL (Espagne)";
    case "sa_es":
      return "SA (Espagne)";
    case "travailleur_autonome_ca":
      return "Travailleur autonome (Canada)";
    case "entreprise_individuelle_ca":
      return "Entreprise individuelle (Canada)";
    case "inc_provincial_ca":
      return "Société par actions provinciale (Canada)";
    case "inc_federal_ca":
      return "Société par actions fédérale (Canada)";
    case "sole_proprietorship_us":
      return "Sole proprietorship (États-Unis)";
    case "single_member_llc_us":
      return "Single-member LLC (États-Unis)";
    case "multi_member_llc_us":
      return "Multi-member LLC (États-Unis)";
    case "c_corp_us":
      return "C-Corp (États-Unis)";
    case "s_corp_us":
      return "S-Corp (États-Unis)";
  }
}

function particulierRevenueLabel(v: ComptaProfileSlice["particulier_revenue_type"]): string {
  switch (v) {
    case "bnc_accessoire":
      return "Activités libérales accessoires (BNC)";
    case "bic_accessoire":
      return "Vente / services commerciaux accessoires (BIC)";
    case "autre":
      return "Autre";
    default:
      return "Non renseigné";
  }
}

function aeActivityLabel(v: ComptaProfileSlice["ae_activity_type"]): string {
  switch (v) {
    case "vente":
      return "Vente de marchandises";
    case "services_bic":
      return "Prestations commerciales / artisanales (BIC)";
    case "services_bnc":
      return "Prestations libérales / intellectuelles (BNC)";
    case "mixte":
      return "Activité mixte";
    default:
      return "Non renseigné";
  }
}

function vatRegimeLabel(v: ComptaProfileSlice["sasu_vat_regime"]): string {
  switch (v) {
    case "reel_mensuel":
      return "Réel normal mensuel";
    case "reel_trimestriel":
      return "Réel normal trimestriel";
    case "simplifie":
      return "Simplifié";
    default:
      return "Non renseigné";
  }
}

function monthLabel(m: number | null | undefined): string {
  if (!m || m < 1 || m > 12) return "—";
  return [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ][m - 1] ?? "—";
}
