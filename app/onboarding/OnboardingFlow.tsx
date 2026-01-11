"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";

import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepGoals } from "./StepGoals";

export interface Offer {
  name: string;
  type: string;
  price: string;
  salesCount: string;
  link: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface OnboardingData {
  // ÉCRAN 1 — Toi & ton business
  firstName: string;
  ageRange: string;
  gender: string;
  country: string;
  niche: string;
  missionStatement: string;
  maturity: string;
  biggestBlocker: string;

  // ÉCRAN 2 — Ta situation actuelle
  hasOffers: boolean | null;
  offers: Offer[];
  socialAudience: string;
  socialLinks: SocialLink[];
  emailListSize: string;
  weeklyHours: string;
  mainGoal90Days: string;

  // ✅ NOUVEAU — Objectif de revenus mensuels (stocké en texte côté DB)
  revenueGoalMonthly: string;

  // Objectifs "symboliques" (devenir riche, aider les autres, etc.)
  mainGoals: string[];

  // ÉCRAN 3 — Ce qui te rend unique
  uniqueValue: string;
  untappedStrength: string;
  biggestChallenge: string;
  successDefinition: string;
  clientFeedback: string[];
  preferredContentType: string;
  tonePreference: string[];
}

const initialData: OnboardingData = {
  firstName: "",
  ageRange: "",
  gender: "",
  country: "",
  niche: "",
  missionStatement: "",
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
};

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    throw new Error((json as any)?.error || `HTTP ${res.status}`);
  }

  return json as T;
}

const OnboardingFlow = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const saveCurrent = async () => {
    // Compat DB: colonne ajoutée en snake_case (texte)
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

  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1) save answers
      await saveCurrent();

      // 2) mark onboarding completed
      await postJSON("/api/onboarding/complete");

      // 3) suite logique : choix des 3 pyramides d'offres (Lovable)
      router.push("/strategy/pyramids");
      router.refresh();

      // 4) generate persona + 3 pyramides + plan en background (ne bloque pas l'UX)
      // Important: cette route doit écrire business_plan.plan_json.offer_pyramids
      postJSON("/api/strategy").catch(() => {
        // On ne casse pas le flow si l'IA échoue; la page /strategy/pyramids gère l'état.
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de finaliser l'onboarding.",
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
            Réponds à quelques questions pour que je puisse créer ton persona, tes offres et un plan d’action adapté à ton
            business.
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
            <StepGoals
              data={data}
              updateData={updateData}
              onBack={prevStep}
              onComplete={handleComplete}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default OnboardingFlow;
export { OnboardingFlow };
