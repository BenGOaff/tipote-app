"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";

import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepGoals } from "./StepGoals";

export interface OnboardingData {
  // Écran 1 - Profil personnel
  firstName: string;
  ageRange: string;
  gender: string;
  country: string;

  // Écran 2 - Business
  niche: string;
  persona: string;
  businessType: string;
  maturity: string;
  audienceSize: string;
  hasOffers: boolean;
  offerPrice: string;
  offerSalesCount: string;
  toolsUsed: string[];
  weeklyTime: string;

  // Écran 3 - Objectifs
  financialGoal: string;
  psychologicalGoal: string;
  contentPreference: string;
  preferredTone: string;
}

const initialData: OnboardingData = {
  firstName: "",
  ageRange: "",
  gender: "",
  country: "",

  niche: "",
  persona: "",
  businessType: "",
  maturity: "",
  audienceSize: "",
  hasOffers: false,
  offerPrice: "",
  offerSalesCount: "",
  toolsUsed: [],
  weeklyTime: "",

  financialGoal: "",
  psychologicalGoal: "",
  contentPreference: "",
  preferredTone: "",
};

function normalizeUrl(input: string) {
  const v = input.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error ?? "Une erreur est survenue.";
    throw new Error(message);
  }

  return (await res.json().catch(() => ({}))) as T;
}

export default function OnboardingForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = async () => {
    setIsSubmitting(true);

    try {
      // ✅ Mapping Lovable UI -> Tipote payload (on conserve la logique Tipote : /api/onboarding/answers puis /complete)
      const payload = {
        // Profil
        firstName: data.firstName,
        ageRange: data.ageRange,
        gender: data.gender,
        country: data.country,

        // Niche / mission (Tipote réutilise mission : on map persona -> mission)
        niche: data.niche,
        nicheOther: "",
        mission: data.persona,

        // Business
        businessMaturity: data.maturity,
        offersStatus: data.hasOffers ? "one_paid" : "none",
        offerNames: data.hasOffers ? (data.businessType || "") : "",
        offerPriceRange: data.hasOffers ? (data.offerPrice || "") : "",
        offerDelivery: "",

        audienceSize: data.audienceSize,
        emailListSize: "",

        timeAvailable: data.weeklyTime,

        // Objectifs (Tipote : mainGoals + tone + content types)
        mainGoals: [data.financialGoal, data.psychologicalGoal].filter(Boolean),
        mainGoalsOther: "",
        preferredContentTypes: data.contentPreference ? [data.contentPreference] : [],
        tonePreference: data.preferredTone,

        // Social links / branding / blocages (conservés dans Tipote mais pas affichés dans Lovable : on garde vide)
        instagramUrl: "",
        tiktokUrl: "",
        linkedinUrl: "",
        youtubeUrl: "",
        websiteUrl: "",
        hasExistingBranding: false,
        biggestBlocker: "",
        additionalContext: "",
      };

      await postJSON<{ ok: boolean }>("/api/onboarding/answers", payload);
      await postJSON<{ ok: boolean }>("/api/onboarding/complete", {});

      toast({
        title: "Onboarding terminé !",
        description: "Ton plan stratégique est en cours de préparation.",
      });

      router.push("/app");
      router.refresh();
    } catch (error) {
      console.error("Erreur completion onboarding:", error);
      toast({
        title: "Erreur",
        description:
          error instanceof Error ? error.message : "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg">Tipote™</h1>
              <p className="text-sm text-muted-foreground">
                Configuration de ton assistant IA
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium">
              Étape {step} sur {totalSteps}
            </p>
            <p className="text-xs text-muted-foreground">
              {Math.round(progress)}% complété
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-4">
          <Progress value={progress} className="h-2" />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          {step === 1 && (
            <StepProfile data={data} updateData={updateData} onNext={nextStep} />
          )}
          {step === 2 && (
            <StepBusiness
              data={data}
              updateData={updateData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {step === 3 && (
            <StepGoals
              data={data}
              updateData={updateData}
              onComplete={handleComplete}
              onBack={prevStep}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </main>
    </div>
  );
}
