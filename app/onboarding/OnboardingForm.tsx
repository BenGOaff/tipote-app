"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

/**
 * Types
 */
type AgeRange =
  | ""
  | "18-24"
  | "25-34"
  | "35-44"
  | "45-54"
  | "55+";

type Gender = "" | "feminin" | "masculin" | "non_genre" | "prefere_ne_pas_repondre";

type BusinessMaturity = "" | "ideation" | "lancement" | "croissance" | "scale";

type OffersStatus = "" | "aucune" | "une" | "plusieurs" | "offre_signature";

type TimeAvailable = "" | "moins_2h" | "2_5h" | "5_10h" | "plus_10h";

type MainGoal =
  | "plus_de_clients"
  | "augmenter_prix"
  | "mieux_structurer"
  | "plus_de_visibilite"
  | "creer_offre"
  | "lancer_funnel"
  | "autre";

type PreferredContentType = "texte" | "video" | "audio" | "mix";

type Niche =
  | ""
  | "argent"
  | "business"
  | "marketing"
  | "coaching"
  | "bien_etre"
  | "spiritualite"
  | "relations"
  | "parentalite"
  | "fitness"
  | "nutrition"
  | "beaute"
  | "mode"
  | "voyage"
  | "creation"
  | "education"
  | "productivite"
  | "tech"
  | "autre";

type FormData = {
  firstName: string;
  ageRange: AgeRange;
  gender: Gender;
  country: string;

  niche: Niche;
  nicheOther: string;
  mission: string;

  businessMaturity: BusinessMaturity;
  offersStatus: OffersStatus;

  offerNames: string;
  offerPriceRange: string;
  offerDelivery: string;

  audienceSize: string;
  emailListSize: string;

  timeAvailable: TimeAvailable;
  mainGoals: MainGoal[];
  mainGoalsOther: string;

  preferredContentTypes: PreferredContentType[];
  tonePreference: string;

  instagramUrl: string;
  tiktokUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
  websiteUrl: string;

  hasExistingBranding: boolean;

  biggestBlocker: string;
  additionalContext: string;
};

type StepId =
  | "profile"
  | "niche"
  | "maturity"
  | "offers"
  | "audience"
  | "goals"
  | "content"
  | "links"
  | "blockers"
  | "review";

type Step = {
  id: StepId;
  title: string;
  subtitle?: string;
};

const STEPS: Step[] = [
  {
    id: "profile",
    title: "Profil",
    subtitle: "Quelques infos pour personnaliser Tipote",
  },
  {
    id: "niche",
    title: "Niche & mission",
    subtitle: "Ce que tu fais et pour qui",
  },
  {
    id: "maturity",
    title: "Maturité business",
    subtitle: "Où tu en es aujourd'hui",
  },
  {
    id: "offers",
    title: "Offres",
    subtitle: "Ton catalogue actuel",
  },
  {
    id: "audience",
    title: "Audience",
    subtitle: "Ta visibilité et tes listes",
  },
  {
    id: "goals",
    title: "Objectifs",
    subtitle: "Ce que tu veux atteindre en priorité",
  },
  {
    id: "content",
    title: "Contenus",
    subtitle: "Ton style et tes préférences",
  },
  {
    id: "links",
    title: "Liens",
    subtitle: "Tes réseaux & site",
  },
  {
    id: "blockers",
    title: "Blocages",
    subtitle: "Ce qui te freine aujourd’hui",
  },
  {
    id: "review",
    title: "Récap",
    subtitle: "Vérifie avant de générer ta stratégie",
  },
];

const AGE_RANGES: AgeRange[] = ["18-24", "25-34", "35-44", "45-54", "55+"];

/**
 * Ces listes sont exportées pour être réutilisées ailleurs (ex: analytics, settings, etc.)
 * et éviter les warnings ESLint `no-unused-vars` quand le fichier ne les consomme pas directement.
 */
export const GENDERS: Gender[] = ["feminin", "masculin", "non_genre", "prefere_ne_pas_repondre"];

export const NICHES: Exclude<Niche, "">[] = [
  "argent",
  "business",
  "marketing",
  "coaching",
  "bien_etre",
  "spiritualite",
  "relations",
  "parentalite",
  "fitness",
  "nutrition",
  "beaute",
  "mode",
  "voyage",
  "creation",
  "education",
  "productivite",
  "tech",
  "autre",
];

export const BUSINESS_MATURITY: Exclude<BusinessMaturity, "">[] = ["ideation", "lancement", "croissance", "scale"];

export const OFFERS_STATUS: Exclude<OffersStatus, "">[] = ["aucune", "une", "plusieurs", "offre_signature"];

export const TIME_AVAILABLE: Exclude<TimeAvailable, "">[] = ["moins_2h", "2_5h", "5_10h", "plus_10h"];

export const MAIN_GOALS: MainGoal[] = [
  "plus_de_clients",
  "augmenter_prix",
  "mieux_structurer",
  "plus_de_visibilite",
  "creer_offre",
  "lancer_funnel",
  "autre",
];

export const PREFERRED_CONTENT_TYPES: PreferredContentType[] = ["texte", "video", "audio", "mix"];

const initialFormData: FormData = {
  firstName: "",
  ageRange: "",
  gender: "",
  country: "",

  niche: "",
  nicheOther: "",
  mission: "",

  businessMaturity: "",
  offersStatus: "",

  offerNames: "",
  offerPriceRange: "",
  offerDelivery: "",

  audienceSize: "",
  emailListSize: "",

  timeAvailable: "",
  mainGoals: [],
  mainGoalsOther: "",

  preferredContentTypes: [],
  tonePreference: "",

  instagramUrl: "",
  tiktokUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
  websiteUrl: "",

  hasExistingBranding: false,

  biggestBlocker: "",
  additionalContext: "",
};

function formatGenderLabel(value: Gender) {
  switch (value) {
    case "feminin":
      return "Féminin";
    case "masculin":
      return "Masculin";
    case "non_genre":
      return "Non genré / autre";
    case "prefere_ne_pas_repondre":
      return "Je préfère ne pas répondre";
    default:
      return value;
  }
}

function formatNicheLabel(value: Niche) {
  switch (value) {
    case "argent":
      return "Argent / finances";
    case "business":
      return "Business / entrepreneuriat";
    case "marketing":
      return "Marketing / acquisition";
    case "coaching":
      return "Coaching / accompagnement";
    case "bien_etre":
      return "Bien-être / santé";
    case "spiritualite":
      return "Spiritualité";
    case "relations":
      return "Relations / couple";
    case "parentalite":
      return "Parentalité";
    case "fitness":
      return "Fitness / sport";
    case "nutrition":
      return "Nutrition";
    case "beaute":
      return "Beauté";
    case "mode":
      return "Mode";
    case "voyage":
      return "Voyage";
    case "creation":
      return "Création / artisanat";
    case "education":
      return "Éducation / formation";
    case "productivite":
      return "Productivité / organisation";
    case "tech":
      return "Tech / outils";
    case "autre":
      return "Autre";
    default:
      return "";
  }
}

function formatBusinessMaturityLabel(value: BusinessMaturity) {
  switch (value) {
    case "ideation":
      return "Idéation (je démarre)";
    case "lancement":
      return "Lancement (0-3 mois)";
    case "croissance":
      return "Croissance (j'ai déjà des ventes)";
    case "scale":
      return "Scale (j'accélère / j'automatise)";
    default:
      return "";
  }
}

function formatOffersStatusLabel(value: OffersStatus) {
  switch (value) {
    case "aucune":
      return "Je n'ai pas encore d'offre";
    case "une":
      return "J'ai une offre";
    case "plusieurs":
      return "J'ai plusieurs offres";
    case "offre_signature":
      return "J'ai une offre signature";
    default:
      return "";
  }
}

function formatTimeAvailableLabel(value: TimeAvailable) {
  switch (value) {
    case "moins_2h":
      return "Moins de 2h / semaine";
    case "2_5h":
      return "2 à 5h / semaine";
    case "5_10h":
      return "5 à 10h / semaine";
    case "plus_10h":
      return "Plus de 10h / semaine";
    default:
      return "";
  }
}

function formatMainGoalLabel(value: MainGoal) {
  switch (value) {
    case "plus_de_clients":
      return "Trouver plus de clients";
    case "augmenter_prix":
      return "Augmenter mes prix";
    case "mieux_structurer":
      return "Mieux structurer mon business";
    case "plus_de_visibilite":
      return "Gagner en visibilité";
    case "creer_offre":
      return "Créer / améliorer une offre";
    case "lancer_funnel":
      return "Lancer un funnel / tunnel";
    case "autre":
      return "Autre";
    default:
      return value;
  }
}

function formatContentTypeLabel(value: PreferredContentType) {
  switch (value) {
    case "texte":
      return "Texte";
    case "video":
      return "Vidéo";
    case "audio":
      return "Audio";
    case "mix":
      return "Mix";
    default:
      return value;
  }
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeUrl(url: string) {
  const v = url.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

function validateStep(stepId: StepId, data: FormData) {
  const errors: Record<string, string> = {};

  if (stepId === "profile") {
    if (!data.firstName.trim()) errors.firstName = "Ton prénom est requis";
    if (!data.ageRange) errors.ageRange = "Sélectionne une tranche d'âge";
    if (!data.gender) errors.gender = "Sélectionne une option";
    if (!data.country.trim()) errors.country = "Ton pays est requis";
  }

  if (stepId === "niche") {
    if (!data.niche) errors.niche = "Sélectionne une niche";
    if (data.niche === "autre" && !data.nicheOther.trim()) errors.nicheOther = "Précise ta niche";
    if (!data.mission.trim()) errors.mission = "Décris en 1-2 phrases ta mission";
  }

  if (stepId === "maturity") {
    if (!data.businessMaturity) errors.businessMaturity = "Sélectionne une option";
  }

  if (stepId === "offers") {
    if (!data.offersStatus) errors.offersStatus = "Sélectionne une option";
    if (data.offersStatus !== "aucune") {
      if (!data.offerNames.trim()) errors.offerNames = "Indique au moins le nom de tes offres";
      if (!data.offerPriceRange.trim()) errors.offerPriceRange = "Indique une fourchette de prix";
      if (!data.offerDelivery.trim()) errors.offerDelivery = "Indique le format de tes offres";
    }
  }

  if (stepId === "audience") {
    if (!data.audienceSize.trim()) errors.audienceSize = "Indique une estimation";
    if (!data.emailListSize.trim()) errors.emailListSize = "Indique une estimation";
  }

  if (stepId === "goals") {
    if (!data.timeAvailable) errors.timeAvailable = "Sélectionne une option";
    if (!data.mainGoals || data.mainGoals.length === 0) errors.mainGoals = "Choisis au moins un objectif";
    if (data.mainGoals.includes("autre") && !data.mainGoalsOther.trim()) errors.mainGoalsOther = "Précise ton objectif";
  }

  if (stepId === "content") {
    if (!data.preferredContentTypes || data.preferredContentTypes.length === 0)
      errors.preferredContentTypes = "Choisis au moins un format";
    if (!data.tonePreference.trim()) errors.tonePreference = "Décris le ton souhaité (ex: direct, fun, premium...)";
  }

  if (stepId === "links") {
    // optional; normalize later
  }

  if (stepId === "blockers") {
    if (!data.biggestBlocker.trim()) errors.biggestBlocker = "Décris ton principal blocage";
  }

  return errors;
}

function countCompletion(data: FormData) {
  const fields: Array<[string, boolean]> = [
    ["firstName", Boolean(data.firstName.trim())],
    ["ageRange", Boolean(data.ageRange)],
    ["gender", Boolean(data.gender)],
    ["country", Boolean(data.country.trim())],

    ["niche", Boolean(data.niche)],
    ["nicheOther", data.niche !== "autre" ? true : Boolean(data.nicheOther.trim())],
    ["mission", Boolean(data.mission.trim())],

    ["businessMaturity", Boolean(data.businessMaturity)],

    ["offersStatus", Boolean(data.offersStatus)],
    ["offerNames", data.offersStatus === "aucune" ? true : Boolean(data.offerNames.trim())],
    ["offerPriceRange", data.offersStatus === "aucune" ? true : Boolean(data.offerPriceRange.trim())],
    ["offerDelivery", data.offersStatus === "aucune" ? true : Boolean(data.offerDelivery.trim())],

    ["audienceSize", Boolean(data.audienceSize.trim())],
    ["emailListSize", Boolean(data.emailListSize.trim())],

    ["timeAvailable", Boolean(data.timeAvailable)],
    ["mainGoals", Boolean(data.mainGoals?.length)],
    ["mainGoalsOther", data.mainGoals?.includes("autre") ? Boolean(data.mainGoalsOther.trim()) : true],

    ["preferredContentTypes", Boolean(data.preferredContentTypes?.length)],
    ["tonePreference", Boolean(data.tonePreference.trim())],

    ["biggestBlocker", Boolean(data.biggestBlocker.trim())],
  ];

  const done = fields.filter(([, ok]) => ok).length;
  return clamp01(done / fields.length);
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Erreur API (${res.status})`);
  }

  return (await res.json()) as T;
}

export default function OnboardingForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [stepIndex, setStepIndex] = React.useState(0);
  const step = STEPS[stepIndex];

  const [formData, setFormData] = React.useState<FormData>(initialFormData);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const progress = React.useMemo(() => countCompletion(formData), [formData]);

  const canGoBack = stepIndex > 0;
  const canGoNext = stepIndex < STEPS.length - 1;

  const setField = React.useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }, []);

  const toggleArrayValue = React.useCallback(
    <K extends keyof FormData>(key: K, value: string) => {
      setFormData((prev) => {
        const current = (prev[key] as unknown as string[]) || [];
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        return { ...prev, [key]: next as unknown as FormData[K] };
      });
      setErrors((prev) => {
        if (!prev[key as string]) return prev;
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    },
    [],
  );

  const validateAndSetErrors = React.useCallback(
    (stepId: StepId) => {
      const nextErrors = validateStep(stepId, formData);
      setErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    },
    [formData],
  );

  const goNext = React.useCallback(() => {
    if (!step) return;

    const ok = validateAndSetErrors(step.id);
    if (!ok) {
      toast({
        title: "On a besoin de quelques infos",
        description: "Vérifie les champs en rouge pour continuer.",
        variant: "destructive",
      });
      return;
    }

    if (canGoNext) setStepIndex((i) => i + 1);
  }, [canGoNext, step, toast, validateAndSetErrors]);

  const goBack = React.useCallback(() => {
    if (canGoBack) setStepIndex((i) => i - 1);
  }, [canGoBack]);

  const submit = React.useCallback(async () => {
    const ok = validateAndSetErrors(step.id);
    if (!ok) {
      toast({
        title: "On a besoin de quelques infos",
        description: "Vérifie les champs en rouge pour continuer.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Normalisation URLs
      const payload = {
        ...formData,
        instagramUrl: normalizeUrl(formData.instagramUrl),
        tiktokUrl: normalizeUrl(formData.tiktokUrl),
        linkedinUrl: normalizeUrl(formData.linkedinUrl),
        youtubeUrl: normalizeUrl(formData.youtubeUrl),
        websiteUrl: normalizeUrl(formData.websiteUrl),
      };

      await postJSON<{ ok: boolean }>("/api/onboarding/answers", payload);

      // Marquer onboarding complet (route dédiée)
      await postJSON<{ ok: boolean }>("/api/onboarding/complete", {});

      toast({
        title: "Onboarding terminé ✅",
        description: "On génère maintenant ta stratégie.",
      });

      router.push("/strategy");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      toast({
        title: "Impossible d'enregistrer",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, router, step.id, toast, validateAndSetErrors]);

  const onPrimary = React.useCallback(() => {
    if (step.id === "review") {
      void submit();
      return;
    }
    goNext();
  }, [goNext, step.id, submit]);

  const primaryLabel = step.id === "review" ? (isSubmitting ? "Enregistrement..." : "Générer ma stratégie") : "Continuer";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Étape {stepIndex + 1} / {STEPS.length} — {step.title}
          </p>
        </div>

        <Link href="/dashboard" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Quitter
        </Link>
      </div>

      <div className="mb-6 space-y-2">
        <Progress value={progress * 100} />
        <p className="text-xs text-muted-foreground">
          Progression globale : {Math.round(progress * 100)}%
        </p>
      </div>

      <Card className="rounded-2xl p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">{step.title}</h2>
          {step.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{step.subtitle}</p> : null}
        </div>

        <div className="space-y-8">
          {step.id === "profile" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  placeholder="Ex: Béné"
                  className={cn(errors.firstName ? "border-destructive" : "")}
                />
                {errors.firstName ? <p className="text-xs text-destructive">{errors.firstName}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label>Tranche d’âge</Label>
                <Select value={formData.ageRange} onValueChange={(v) => setField("ageRange", v as AgeRange)}>
                  <SelectTrigger className={cn(errors.ageRange ? "border-destructive" : "")}>
                    <SelectValue placeholder="Sélectionne une tranche" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_RANGES.map((ar) => (
                      <SelectItem key={ar} value={ar}>
                        {ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.ageRange ? <p className="text-xs text-destructive">{errors.ageRange}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label>Genre</Label>
                <Select value={formData.gender} onValueChange={(v) => setField("gender", v as Gender)}>
                  <SelectTrigger className={cn(errors.gender ? "border-destructive" : "")}>
                    <SelectValue placeholder="Sélectionne une option" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {formatGenderLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.gender ? <p className="text-xs text-destructive">{errors.gender}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="country">Pays</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setField("country", e.target.value)}
                  placeholder="Ex: France"
                  className={cn(errors.country ? "border-destructive" : "")}
                />
                {errors.country ? <p className="text-xs text-destructive">{errors.country}</p> : null}
              </div>
            </section>
          ) : null}

          {step.id === "niche" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label>Niche</Label>
                <Select value={formData.niche} onValueChange={(v) => setField("niche", v as Niche)}>
                  <SelectTrigger className={cn(errors.niche ? "border-destructive" : "")}>
                    <SelectValue placeholder="Sélectionne une niche" />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n} value={n}>
                        {formatNicheLabel(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.niche ? <p className="text-xs text-destructive">{errors.niche}</p> : null}
              </div>

              {formData.niche === "autre" ? (
                <div className="grid gap-2">
                  <Label htmlFor="nicheOther">Précise ta niche</Label>
                  <Input
                    id="nicheOther"
                    value={formData.nicheOther}
                    onChange={(e) => setField("nicheOther", e.target.value)}
                    placeholder="Ex: Organisation, B2B, artisanat…"
                    className={cn(errors.nicheOther ? "border-destructive" : "")}
                  />
                  {errors.nicheOther ? <p className="text-xs text-destructive">{errors.nicheOther}</p> : null}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="mission">Ta mission (1-2 phrases)</Label>
                <Textarea
                  id="mission"
                  value={formData.mission}
                  onChange={(e) => setField("mission", e.target.value)}
                  placeholder="Ex: J'aide les indépendants à..."
                  className={cn(errors.mission ? "border-destructive" : "")}
                />
                {errors.mission ? <p className="text-xs text-destructive">{errors.mission}</p> : null}
              </div>
            </section>
          ) : null}

          {step.id === "maturity" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label>Où en es-tu ?</Label>
                <RadioGroup
                  value={formData.businessMaturity}
                  onValueChange={(v) => setField("businessMaturity", v as BusinessMaturity)}
                  className={cn("grid gap-3", errors.businessMaturity ? "rounded-lg border border-destructive p-3" : "")}
                >
                  {BUSINESS_MATURITY.map((m) => (
                    <div key={m} className="flex items-start gap-3">
                      <RadioGroupItem value={m} id={`maturity-${m}`} />
                      <Label htmlFor={`maturity-${m}`} className="font-normal">
                        {formatBusinessMaturityLabel(m)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.businessMaturity ? (
                  <p className="text-xs text-destructive">{errors.businessMaturity}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {step.id === "offers" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label>Statut de tes offres</Label>
                <RadioGroup
                  value={formData.offersStatus}
                  onValueChange={(v) => setField("offersStatus", v as OffersStatus)}
                  className={cn("grid gap-3", errors.offersStatus ? "rounded-lg border border-destructive p-3" : "")}
                >
                  {OFFERS_STATUS.map((s) => (
                    <div key={s} className="flex items-start gap-3">
                      <RadioGroupItem value={s} id={`offers-${s}`} />
                      <Label htmlFor={`offers-${s}`} className="font-normal">
                        {formatOffersStatusLabel(s)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.offersStatus ? <p className="text-xs text-destructive">{errors.offersStatus}</p> : null}
              </div>

              {formData.offersStatus !== "aucune" ? (
                <>
                  <Separator />

                  <div className="grid gap-2">
                    <Label htmlFor="offerNames">Nom(s) d’offre(s)</Label>
                    <Textarea
                      id="offerNames"
                      value={formData.offerNames}
                      onChange={(e) => setField("offerNames", e.target.value)}
                      placeholder="Ex: Coaching 1:1, Formation, Template..."
                      className={cn(errors.offerNames ? "border-destructive" : "")}
                    />
                    {errors.offerNames ? <p className="text-xs text-destructive">{errors.offerNames}</p> : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="offerPriceRange">Fourchette de prix</Label>
                    <Input
                      id="offerPriceRange"
                      value={formData.offerPriceRange}
                      onChange={(e) => setField("offerPriceRange", e.target.value)}
                      placeholder="Ex: 49€ / 499€ / 2000€..."
                      className={cn(errors.offerPriceRange ? "border-destructive" : "")}
                    />
                    {errors.offerPriceRange ? (
                      <p className="text-xs text-destructive">{errors.offerPriceRange}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="offerDelivery">Format / délivrabilité</Label>
                    <Input
                      id="offerDelivery"
                      value={formData.offerDelivery}
                      onChange={(e) => setField("offerDelivery", e.target.value)}
                      placeholder="Ex: Visio, asynchrone, groupe..."
                      className={cn(errors.offerDelivery ? "border-destructive" : "")}
                    />
                    {errors.offerDelivery ? <p className="text-xs text-destructive">{errors.offerDelivery}</p> : null}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {step.id === "audience" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="audienceSize">Taille de ton audience (approx.)</Label>
                <Input
                  id="audienceSize"
                  value={formData.audienceSize}
                  onChange={(e) => setField("audienceSize", e.target.value)}
                  placeholder="Ex: 1000 abonnés IG, 500 LinkedIn…"
                  className={cn(errors.audienceSize ? "border-destructive" : "")}
                />
                {errors.audienceSize ? <p className="text-xs text-destructive">{errors.audienceSize}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="emailListSize">Taille de ta liste email (approx.)</Label>
                <Input
                  id="emailListSize"
                  value={formData.emailListSize}
                  onChange={(e) => setField("emailListSize", e.target.value)}
                  placeholder="Ex: 0, 120, 2000…"
                  className={cn(errors.emailListSize ? "border-destructive" : "")}
                />
                {errors.emailListSize ? <p className="text-xs text-destructive">{errors.emailListSize}</p> : null}
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Checkbox
                  id="hasExistingBranding"
                  checked={formData.hasExistingBranding}
                  onCheckedChange={(v) => setField("hasExistingBranding", Boolean(v))}
                />
                <Label htmlFor="hasExistingBranding" className="font-normal">
                  J’ai déjà une identité visuelle / branding (logo, couleurs, etc.)
                </Label>
              </div>
            </section>
          ) : null}

          {step.id === "goals" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label>Temps dispo / semaine</Label>
                <RadioGroup
                  value={formData.timeAvailable}
                  onValueChange={(v) => setField("timeAvailable", v as TimeAvailable)}
                  className={cn("grid gap-3", errors.timeAvailable ? "rounded-lg border border-destructive p-3" : "")}
                >
                  {TIME_AVAILABLE.map((t) => (
                    <div key={t} className="flex items-start gap-3">
                      <RadioGroupItem value={t} id={`time-${t}`} />
                      <Label htmlFor={`time-${t}`} className="font-normal">
                        {formatTimeAvailableLabel(t)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.timeAvailable ? <p className="text-xs text-destructive">{errors.timeAvailable}</p> : null}
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label>Objectifs principaux (choisis 1 à 3)</Label>
                <div className={cn("grid gap-3", errors.mainGoals ? "rounded-lg border border-destructive p-3" : "")}>
                  {MAIN_GOALS.map((g) => (
                    <div key={g} className="flex items-start gap-3">
                      <Checkbox
                        id={`goal-${g}`}
                        checked={formData.mainGoals.includes(g)}
                        onCheckedChange={() => toggleArrayValue("mainGoals", g)}
                      />
                      <Label htmlFor={`goal-${g}`} className="font-normal">
                        {formatMainGoalLabel(g)}
                      </Label>
                    </div>
                  ))}
                </div>
                {errors.mainGoals ? <p className="text-xs text-destructive">{errors.mainGoals}</p> : null}
              </div>

              {formData.mainGoals.includes("autre") ? (
                <div className="grid gap-2">
                  <Label htmlFor="mainGoalsOther">Précise ton objectif</Label>
                  <Input
                    id="mainGoalsOther"
                    value={formData.mainGoalsOther}
                    onChange={(e) => setField("mainGoalsOther", e.target.value)}
                    placeholder="Ex: lancer un podcast, ouvrir une offre B2B…"
                    className={cn(errors.mainGoalsOther ? "border-destructive" : "")}
                  />
                  {errors.mainGoalsOther ? <p className="text-xs text-destructive">{errors.mainGoalsOther}</p> : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {step.id === "content" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label>Formats de contenus préférés</Label>
                <div
                  className={cn(
                    "grid gap-3 sm:grid-cols-2",
                    errors.preferredContentTypes ? "rounded-lg border border-destructive p-3" : "",
                  )}
                >
                  {PREFERRED_CONTENT_TYPES.map((c) => (
                    <div key={c} className="flex items-start gap-3">
                      <Checkbox
                        id={`ct-${c}`}
                        checked={formData.preferredContentTypes.includes(c)}
                        onCheckedChange={() => toggleArrayValue("preferredContentTypes", c)}
                      />
                      <Label htmlFor={`ct-${c}`} className="font-normal">
                        {formatContentTypeLabel(c)}
                      </Label>
                    </div>
                  ))}
                </div>
                {errors.preferredContentTypes ? (
                  <p className="text-xs text-destructive">{errors.preferredContentTypes}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tonePreference">Ton souhaité</Label>
                <Input
                  id="tonePreference"
                  value={formData.tonePreference}
                  onChange={(e) => setField("tonePreference", e.target.value)}
                  placeholder="Ex: direct, fun, premium, pédagogique…"
                  className={cn(errors.tonePreference ? "border-destructive" : "")}
                />
                {errors.tonePreference ? <p className="text-xs text-destructive">{errors.tonePreference}</p> : null}
              </div>
            </section>
          ) : null}

          {step.id === "links" ? (
            <section className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Optionnel — mais ça aide Tipote à contextualiser (et à faire des suggestions plus pertinentes).
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="instagramUrl">Instagram</Label>
                  <Input
                    id="instagramUrl"
                    value={formData.instagramUrl}
                    onChange={(e) => setField("instagramUrl", e.target.value)}
                    placeholder="https://instagram.com/…"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tiktokUrl">TikTok</Label>
                  <Input
                    id="tiktokUrl"
                    value={formData.tiktokUrl}
                    onChange={(e) => setField("tiktokUrl", e.target.value)}
                    placeholder="https://tiktok.com/@…"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="linkedinUrl">LinkedIn</Label>
                  <Input
                    id="linkedinUrl"
                    value={formData.linkedinUrl}
                    onChange={(e) => setField("linkedinUrl", e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="youtubeUrl">YouTube</Label>
                  <Input
                    id="youtubeUrl"
                    value={formData.youtubeUrl}
                    onChange={(e) => setField("youtubeUrl", e.target.value)}
                    placeholder="https://youtube.com/@…"
                  />
                </div>

                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="websiteUrl">Site web</Label>
                  <Input
                    id="websiteUrl"
                    value={formData.websiteUrl}
                    onChange={(e) => setField("websiteUrl", e.target.value)}
                    placeholder="https://tonsite.com"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {step.id === "blockers" ? (
            <section className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="biggestBlocker">Ton principal blocage du moment</Label>
                <Textarea
                  id="biggestBlocker"
                  value={formData.biggestBlocker}
                  onChange={(e) => setField("biggestBlocker", e.target.value)}
                  placeholder="Ex: je poste mais j'ai peu de résultats, je manque de clarté sur mon offre..."
                  className={cn(errors.biggestBlocker ? "border-destructive" : "")}
                />
                {errors.biggestBlocker ? <p className="text-xs text-destructive">{errors.biggestBlocker}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="additionalContext">Contexte additionnel (optionnel)</Label>
                <Textarea
                  id="additionalContext"
                  value={formData.additionalContext}
                  onChange={(e) => setField("additionalContext", e.target.value)}
                  placeholder="Tout ce qui te semble utile : contraintes, ambitions, histoire, etc."
                />
              </div>
            </section>
          ) : null}

          {step.id === "review" ? (
            <section className="space-y-6">
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Profil</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Prénom :</span> {formData.firstName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Âge :</span> {formData.ageRange}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Genre :</span> {formatGenderLabel(formData.gender)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Pays :</span> {formData.country}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Niche & mission</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Niche :</span>{" "}
                    {formData.niche === "autre"
                      ? `Autre — ${formData.nicheOther || "(non précisé)"}`
                      : formatNicheLabel(formData.niche)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Mission :</span> {formData.mission}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Business</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Maturité :</span>{" "}
                    {formatBusinessMaturityLabel(formData.businessMaturity)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Offres :</span>{" "}
                    {formatOffersStatusLabel(formData.offersStatus)}
                  </p>
                  {formData.offersStatus !== "aucune" ? (
                    <>
                      <p>
                        <span className="text-muted-foreground">Noms :</span> {formData.offerNames}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Prix :</span> {formData.offerPriceRange}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Format :</span> {formData.offerDelivery}
                      </p>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Audience</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Audience :</span> {formData.audienceSize}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Liste email :</span> {formData.emailListSize}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Branding :</span>{" "}
                    {formData.hasExistingBranding ? "Oui" : "Non"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Objectifs</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Temps dispo :</span>{" "}
                    {formatTimeAvailableLabel(formData.timeAvailable)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Objectifs :</span>{" "}
                    {formData.mainGoals
                      .map((g) => (g === "autre" ? `Autre — ${formData.mainGoalsOther || "(non précisé)"}` : formatMainGoalLabel(g)))
                      .join(", ")}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Contenus</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Formats :</span>{" "}
                    {formData.preferredContentTypes.map((c) => formatContentTypeLabel(c)).join(", ")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Ton :</span> {formData.tonePreference}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Liens</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Instagram :</span> {formData.instagramUrl || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">TikTok :</span> {formData.tiktokUrl || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">LinkedIn :</span> {formData.linkedinUrl || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">YouTube :</span> {formData.youtubeUrl || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Site :</span> {formData.websiteUrl || "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Blocages</h3>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Principal :</span> {formData.biggestBlocker}
                  </p>
                  {formData.additionalContext ? (
                    <p>
                      <span className="text-muted-foreground">Contexte :</span> {formData.additionalContext}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                En cliquant sur “Générer ma stratégie”, Tipote enregistre tes réponses et lance le diagnostic.
              </p>
            </section>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={goBack} disabled={!canGoBack || isSubmitting}>
            Retour
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {stepIndex + 1}/{STEPS.length}
            </span>
            <Button onClick={onPrimary} disabled={isSubmitting}>
              {primaryLabel}
            </Button>
          </div>
        </div>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Besoin d’aide ?{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Paramètres
        </Link>
      </p>
    </div>
  );
}
