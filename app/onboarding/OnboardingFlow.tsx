"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";

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
  const answers = p?.diagnosticAnswers ?? p?.diagnostic_answers ?? p?.answers ?? p?.messages ?? [];
  const profile = p?.diagnosticProfile ?? p?.diagnostic_profile ?? p?.profile ?? null;
  const summary = p?.diagnosticSummary ?? p?.diagnostic_summary ?? p?.summary ?? "";
  return {
    diagnosticAnswers: Array.isArray(answers) ? answers : [],
    diagnosticProfile: profile && typeof profile === "object" ? profile : null,
    diagnosticSummary: typeof summary === "string" ? summary : "",
  };
}

const OnboardingFlow = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateData = (updates: Partial<OnboardingData>) => setData((prev) => ({ ...prev, ...updates }));

  const saveCurrent = async () => {
    await postJSON("/api/onboarding/answers", {
      ...data,
      revenue_goal_monthly: data.revenueGoalMonthly,
    });
  };

  const nextStep = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await saveCurrent();
      setStep((prev) => Math.min(prev + 1, 3));
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d'enregistrer tes réponses.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const prevStep = () => {
    if (isSubmitting) return;
    setStep((prev) => Math.max(prev - 1, 1));
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

      await postJSON("/api/onboarding/answers", {
        diagnostic_answers: diagnostic.diagnosticAnswers ?? [],
        diagnostic_profile: diagnostic.diagnosticProfile ?? null,
        diagnostic_summary: diagnostic.diagnosticSummary ?? "",
        diagnostic_completed: true,
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
      });

      await postJSON("/api/onboarding/complete", { diagnostic_completed: true });

      router.push("/strategy/pyramids");
      router.refresh();

      // ✅ anti-régression
      postJSON("/api/strategy").catch(() => {});
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de finaliser ton onboarding.",
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
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Bienvenue sur Tipote
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Réponds à quelques questions. Ensuite, on passe en mode diagnostic pour une stratégie ultra personnalisée.
          </p>
        </div>

        <div className="mb-8">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Étape {step} sur 3</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="space-y-6">
          {step === 1 && <StepProfile data={data} updateData={updateData} onNext={nextStep} />}
          {step === 2 && <StepBusiness data={data} updateData={updateData} onNext={nextStep} onBack={prevStep} />}
          {step === 3 && (
            <StepDiagnosticChat data={data} onBack={prevStep} isSubmitting={isSubmitting} onComplete={finalizeOnboarding} />
          )}
        </div>
      </main>
    </div>
  );
};

export default OnboardingFlow;
export { OnboardingFlow };
