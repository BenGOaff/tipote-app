"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepGoals } from "./StepGoals";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";

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

export const OnboardingFlow = () => {
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
      // ✅ Logique Tipote conservée : on persiste via API (Supabase server-side)
      const payload = {
        // Profil
        firstName: data.firstName,
        ageRange: data.ageRange,
        gender: data.gender,
        country: data.country,

        // Business
        niche: data.niche,
        nicheOther: "",
        mission: data.persona,

        businessMaturity: data.maturity,
        offersStatus: data.hasOffers ? "one_paid" : "none",
        offerNames: data.hasOffers ? (data.businessType || "") : "",
        offerPriceRange: data.hasOffers ? (data.offerPrice || "") : "",
        offerDelivery: "",

        audienceSize: data.audienceSize,
        emailListSize: "",

        timeAvailable: data.weeklyTime,

        mainGoals: [data.financialGoal, data.psychologicalGoal].filter(Boolean),
        mainGoalsOther: "",
        preferredContentTypes: data.contentPreference ? [data.contentPreference] : [],
        tonePreference: data.preferredTone,

        socialLinks: {
          instagram: null,
          tiktok: null,
          linkedin: null,
          youtube: null,
          website: null,
        },

        hasExistingBranding: false,
        biggestBlocker: "",
        additionalContext: "",
      };

      await postJSON<{ ok: boolean }>("/api/onboarding/answers", payload);
      await postJSON<{ ok: boolean }>("/api/onboarding/complete", {});

      toast({
        title: "Onboarding terminé !",
        description: "Votre profil a été sauvegardé avec succès.",
      });

      router.push("/app");
      router.refresh();
    } catch (error) {
      console.error("Onboarding completion error:", error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder votre profil.",
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
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl">Tipote™</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Étape {step} sur {totalSteps}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-6 py-4 bg-background/50">
        <div className="max-w-2xl mx-auto">
          <Progress value={progress} className="h-2" />
        </div>
      </div>

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
};
