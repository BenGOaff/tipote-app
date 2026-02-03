"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";
import { ampTrack } from "@/lib/telemetry/amplitude-client";

import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepDiagnosticChat, type DiagnosticPayload } from "./StepDiagnosticChat";

export interface Offer {
  name: string;
  type: string;
  price: string;
  salesCount?: string;
  sales?: string | number;
  link?: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface OnboardingData {
  // Socle minimal (écran 1)
  firstName: string;
  country: string;
  niche: string;
  missionStatement: string;

  // Gardés pour compat (anciens champs — peuvent rester vides)
  ageRange: string;
  gender: string;
  maturity: string;
  biggestBlocker: string;

  // Socle minimal (écran 2)
  hasOffers: boolean | null;
  offers: Offer[];
  socialAudience: string;
  socialLinks: SocialLink[];
  emailListSize: string;
  weeklyHours: string;
  mainGoal90Days: string;

  revenueGoalMonthly: string;
  mainGoals: string[];

  // Gardés pour compat (anciens champs — chat ensuite)
  uniqueValue: string;
  untappedStrength: string;
  biggestChallenge: string;
  successDefinition: string;
  clientFeedback: string[];
  preferredContentType: string;
  tonePreference: string[];

  // Phase 2 chat
  diagnosticAnswers?: unknown[];
  diagnosticProfile?: Record<string, unknown> | null;
  diagnosticSummary?: string;
  diagnosticCompleted?: boolean;
  onboardingVersion?: string;
}

const initialData: OnboardingData = {
  firstName: "",
  country: "",
  niche: "",
  missionStatement: "",

  ageRange: "",
  gender: "",
  maturity: "",
  biggestBlocker: "",

  hasOffers: null,
  offers: [],
  socialAudience: "",
  socialLinks: [],
  emailListSize: "",
  weeklyHours: "",
  mainGoal90Days: "",

  revenueGoalMonthly: "",
  mainGoals: [],

  uniqueValue: "",
  untappedStrength: "",
  biggestChallenge: "",
  successDefinition: "",
  clientFeedback: [""],
  preferredContentType: "",
  tonePreference: [],

  diagnosticAnswers: [],
  diagnosticProfile: null,
  diagnosticSummary: "",
  diagnosticCompleted: false,
  onboardingVersion: "v2_min_form+chat",
};

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json as T;
}

function normalizeDiagnosticPayload(payload: DiagnosticPayload): {
  diagnosticAnswers?: unknown[];
  diagnosticProfile?: Record<string, unknown> | null;
  diagnosticSummary?: string;
} {
  const p: any = payload as any;
  const answers =
    p?.diagnosticAnswers ?? p?.diagnostic_answers ?? p?.answers ?? p?.messages ?? [];
  const profile = p?.diagnosticProfile ?? p?.diagnostic_profile ?? p?.profile ?? null;
  const summary = p?.diagnosticSummary ?? p?.diagnostic_summary ?? p?.summary ?? "";
  return {
    diagnosticAnswers: Array.isArray(answers) ? answers : [],
    diagnosticProfile: profile && typeof profile === "object" ? profile : null,
    diagnosticSummary: typeof summary === "string" ? summary : "",
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function compactStringArray(arr: string[] | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

/**
 * IMPORTANT:
 * - On n'envoie PAS les champs vides -> évite d'écraser en DB une valeur existante par "".
 * - On mappe revenueGoalMonthly -> revenue_goal_monthly uniquement si rempli.
 * - On garde les booléens et les tableaux utiles.
 */
function buildOnboardingAnswersPayload(d: OnboardingData) {
  const payload: Record<string, unknown> = {};

  // Step 1
  if (isNonEmptyString(d.firstName)) payload.firstName = d.firstName;
  if (isNonEmptyString(d.country)) payload.country = d.country;
  if (isNonEmptyString(d.niche)) payload.niche = d.niche;
  if (isNonEmptyString(d.missionStatement)) payload.missionStatement = d.missionStatement;

  // Compat (si un jour réactivés côté UI)
  if (isNonEmptyString(d.ageRange)) payload.ageRange = d.ageRange;
  if (isNonEmptyString(d.gender)) payload.gender = d.gender;
  if (isNonEmptyString(d.maturity)) payload.maturity = d.maturity;
  if (isNonEmptyString(d.biggestBlocker)) payload.biggestBlocker = d.biggestBlocker;

  // Step 2
  if (typeof d.hasOffers === "boolean") payload.hasOffers = d.hasOffers;
  if (Array.isArray(d.offers) && d.offers.length > 0) payload.offers = d.offers;
  if (isNonEmptyString(d.socialAudience)) payload.socialAudience = d.socialAudience;
  if (Array.isArray(d.socialLinks) && d.socialLinks.length > 0) payload.socialLinks = d.socialLinks;
  if (isNonEmptyString(d.emailListSize)) payload.emailListSize = d.emailListSize;
  if (isNonEmptyString(d.weeklyHours)) payload.weeklyHours = d.weeklyHours;
  if (isNonEmptyString(d.mainGoal90Days)) payload.mainGoal90Days = d.mainGoal90Days;

  // Objectif revenu (clé snake_case attendue côté API) - seulement si fourni
  if (isNonEmptyString(d.revenueGoalMonthly)) {
    payload.revenueGoalMonthly = d.revenueGoalMonthly;
    payload.revenue_goal_monthly = d.revenueGoalMonthly;
  }

  const goals = compactStringArray(d.mainGoals);
  if (goals.length > 0) payload.mainGoals = goals;

  // Compat (si un jour réactivés côté UI)
  if (isNonEmptyString(d.uniqueValue)) payload.uniqueValue = d.uniqueValue;
  if (isNonEmptyString(d.untappedStrength)) payload.untappedStrength = d.untappedStrength;
  if (isNonEmptyString(d.biggestChallenge)) payload.biggestChallenge = d.biggestChallenge;
  if (isNonEmptyString(d.successDefinition)) payload.successDefinition = d.successDefinition;

  const feedback = compactStringArray(d.clientFeedback);
  if (feedback.length > 0) payload.clientFeedback = feedback;

  if (isNonEmptyString(d.preferredContentType)) payload.preferredContentType = d.preferredContentType;

  const tones = compactStringArray(d.tonePreference);
  if (tones.length > 0) payload.tonePreference = tones;

  // Version (utile analytics)
  if (isNonEmptyString(d.onboardingVersion)) payload.onboardingVersion = d.onboardingVersion;

  return payload;
}

const OnboardingFlow = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateData = (updates: Partial<OnboardingData>) =>
    setData((prev) => ({ ...prev, ...updates }));

  const saveCurrent = async () => {
    await postJSON("/api/onboarding/answers", buildOnboardingAnswersPayload(data));
  };

  const nextStep = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await saveCurrent();

      const next = Math.min(step + 1, 3);

      ampTrack("tipote_onboarding_step_completed", {
        step,
        next_step: next,
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
      });

      setStep(next);
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer tes réponses.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const prevStep = () => {
    if (isSubmitting) return;

    const prev = Math.max(step - 1, 1);

    ampTrack("tipote_onboarding_back_clicked", {
      step,
      prev_step: prev,
      onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
    });

    setStep(prev);
  };

  const finalizeOnboarding = async (payload: DiagnosticPayload) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const diagnostic = normalizeDiagnosticPayload(payload);

      updateData({
        diagnosticAnswers: diagnostic.diagnosticAnswers ?? [],
        diagnosticProfile: diagnostic.diagnosticProfile ?? null,
        diagnosticSummary: diagnostic.diagnosticSummary ?? "",
        diagnosticCompleted: true,
      });

      // ✅ on persiste diagnostic + toutes les réponses non-vides déjà saisies
      await postJSON("/api/onboarding/answers", {
        ...buildOnboardingAnswersPayload(data),
        diagnostic_answers: diagnostic.diagnosticAnswers ?? [],
        diagnostic_profile: diagnostic.diagnosticProfile ?? null,
        diagnostic_summary: diagnostic.diagnosticSummary ?? "",
        diagnostic_completed: true,
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
      });

      await postJSON("/api/onboarding/complete", { diagnostic_completed: true });

      ampTrack("tipote_onboarding_completed", {
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
        diagnostic_completed: true,
        diagnostic_answers_count: (diagnostic.diagnosticAnswers ?? []).length,
        has_diagnostic_profile: Boolean(diagnostic.diagnosticProfile),
        diagnostic_summary_len: (diagnostic.diagnosticSummary ?? "").length,
      });

      router.push("/strategy/pyramids");
      router.refresh();

      // ✅ anti-régression
      postJSON("/api/strategy").catch(() => {});
    } catch (error) {
      ampTrack("tipote_onboarding_error", {
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
        message: error instanceof Error ? error.message : String(error),
        step,
      });

      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de finaliser ton onboarding.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Ton onboarding
          </h1>
          <p className="text-muted-foreground">Quelques questions pour personnaliser Tipote™</p>
        </div>

        <div className="mb-8">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Étape {step} sur 3
          </p>
        </div>

        <div>
          {step === 1 && <StepProfile data={data} updateData={updateData} onNext={nextStep} />}
          {step === 2 && (
            <StepBusiness data={data} updateData={updateData} onNext={nextStep} onBack={prevStep} />
          )}
          {step === 3 && (
            <StepDiagnosticChat
              data={data}
              onBack={prevStep}
              isSubmitting={isSubmitting}
              onComplete={finalizeOnboarding}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default OnboardingFlow;
export { OnboardingFlow };
