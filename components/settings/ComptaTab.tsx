"use client";

// Onglet Compta dans Paramètres — country gate avant le vrai dashboard.
//
// État affiché selon la valeur de `country` (lue + sauvegardée dans
// business_profiles.country, partagée avec l'onboarding) :
//   • vide             → mini sélecteur "Tu vis dans quel pays ?"
//   • France (synonymes) → placeholder "module en construction"
//   • autre            → message "bientôt disponible pour [pays]"
//
// Les vrais écrans compta (statut + connexions PSP + dashboard CA…)
// arrivent dans les sous-commits 1b → 1e ; pour l'instant on prépare
// juste la porte d'entrée.

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Globe, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  COUNTRY_OPTIONS,
  isFrenchCountry,
  SUPPORTED_COUNTRIES,
} from "@/lib/compta/countries";

interface Props {
  /** Valeur actuelle de business_profiles.country pour le projet actif. */
  country: string | null;
  /** Notifie le parent (SettingsTabsShell) après une sauvegarde réussie
   *  pour qu'il rafraîchisse son état local. */
  onCountrySaved: (next: string) => void;
}

export default function ComptaTab({ country, onCountrySaved }: Props) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function saveCountry(next: string) {
    if (!next) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: next }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!json?.ok) throw new Error(json?.error ?? "Erreur");
        onCountrySaved(next);
      } catch (e) {
        toast({
          title: "Oups",
          description: e instanceof Error ? e.message : "Impossible d'enregistrer",
          variant: "destructive",
        });
      }
    });
  }

  const hasCountry = (country ?? "").trim().length > 0;
  const isFrance = isFrenchCountry(country);

  return (
    <div className="space-y-6">
      <DisclaimerBanner />

      {!hasCountry ? (
        <CountryGateForm pending={pending} onSave={saveCountry} />
      ) : isFrance ? (
        <FrancePlaceholder />
      ) : (
        <UnsupportedCountry country={country!} pending={pending} onSave={saveCountry} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Bandeau permanent — Tipote ≠ comptable
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
 * Placeholder France — le vrai dashboard arrive en sous-commits
 * ────────────────────────────────────────────────────────────────── */

function FrancePlaceholder() {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-lg">Module en construction</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Tu es en France : tu auras bientôt l&apos;accès complet à
            l&apos;aide compta. On déploie le module pas-à-pas pour
            qu&apos;il soit fiable dès le 1ᵉʳ jour.
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Ce qui arrive :</p>
        <ul className="space-y-1 list-disc list-inside ml-1">
          <li>Configurer ton statut (particulier / auto-entrepreneur / SASU)</li>
          <li>Connecter Stripe, PayPal, Mollie pour suivre tes encaissements</li>
          <li>Voir ton chiffre d&apos;affaires en temps réel</li>
          <li>Être prévenu·e quand tu approches d&apos;un seuil de TVA</li>
          <li>Recevoir le calendrier fiscal personnalisé (URSSAF, TVA, IS…)</li>
          <li>Exporter le FEC pour ton comptable</li>
        </ul>
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Pays non encore supporté + possibilité de corriger la saisie
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
