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
  SUPPORTED_COUNTRIES,
} from "@/lib/compta/countries";
import {
  type AccountingStatus,
  type ComptaProfileSlice,
  emptyComptaSlice,
} from "@/lib/compta/types";
import ComptaConfigForm from "@/components/settings/ComptaConfigForm";
import ComptaConnections from "@/components/settings/ComptaConnections";
import ComptaManualTransactions from "@/components/settings/ComptaManualTransactions";
import ComptaDashboard from "@/components/settings/ComptaDashboard";

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
      ) : !isFrance ? (
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
    <Card className="p-6 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-900 text-sm">
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

      {/* Tableau de bord — CA YTD + 12 mois + jauge TVA (1f) */}
      <ComptaDashboard />

      {/* Section "Mes connexions" — Stripe + PayPal + Mollie (phases 1c/1d) */}
      <ComptaConnections />

      {/* Section "Saisies manuelles" — virements / espèces / chèques (1e) */}
      <ComptaManualTransactions />

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg">À venir</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Prochaine étape qui s&apos;appuie sur ces données :
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <ul className="space-y-1 list-disc list-inside ml-1">
            <li>Calendrier fiscal personnalisé (URSSAF, TVA, IS…)</li>
            {status === "sasu" ? (
              <li>Exporter le FEC pour ton comptable</li>
            ) : null}
            <li>Mise à jour automatique des seuils fiscaux chaque année</li>
          </ul>
        </div>
      </Card>
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
  } else if (slice.accounting_status === "sasu") {
    rows.push({
      label: "SIREN",
      value: slice.sasu_siren ?? "Non renseigné",
      href: slice.sasu_siren
        ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${slice.sasu_siren}`
        : undefined,
      hrefLabel: "Voir sur annuaire-entreprises",
    });
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
    rows.push({
      label: "Dirigeant rémunéré",
      value: slice.sasu_dirigeant_remunere ? "Oui (URSSAF + DSN)" : "Non (dividendes uniquement)",
    });
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
