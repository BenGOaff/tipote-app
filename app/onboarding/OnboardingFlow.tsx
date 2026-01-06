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
  nicheOther: string;

  // Question persona (CDC)
  persona: string;

  businessType: string;
  businessTypeOther: string;

  // Maturité CA (CDC)
  businessMaturity: string;

  // Taille audience (CDC) -> séparé social / email
  audienceSocial: string;
  audienceEmail: string;

  // Offres existantes (CDC)
  hasOffers: boolean;
  offerPrice: string;
  offerSalesCount: string;
  offerSalesPageLinks: string;

  // Outils utilisés (CDC)
  toolsUsed: string[];
  toolsOther: string;

  // Temps dispo (CDC)
  timeAvailable: string;

  // Écran 3 - Objectifs
  financialGoal: string;
  psychologicalGoals: string[];
  psychologicalGoalsOther: string;

  contentPreference: string; // ecriture | video
  preferredTone: string;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const msg = (json as any)?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export const OnboardingFlow = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalSteps = 3;

  const [data, setData] = useState<OnboardingData>({
    firstName: "",
    ageRange: "",
    gender: "",
    country: "",

    niche: "",
    nicheOther: "",

    persona: "",

    businessType: "",
    businessTypeOther: "",

    businessMaturity: "",

    audienceSocial: "",
    audienceEmail: "",

    hasOffers: false,
    offerPrice: "",
    offerSalesCount: "",
    offerSalesPageLinks: "",

    toolsUsed: [],
    toolsOther: "",

    timeAvailable: "",

    financialGoal: "",
    psychologicalGoals: [],
    psychologicalGoalsOther: "",

    contentPreference: "",
    preferredTone: "",
  });

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (step < totalSteps) {
      setStep((s) => s + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep((s) => s - 1);
    }
  };

  const handleComplete = async () => {
    try {
      setIsSubmitting(true);

      await postJSON<{ ok: boolean }>("/api/onboarding/answers", data);
      await postJSON<{ ok: boolean }>("/api/onboarding/complete", {});

      toast({
        title: "Onboarding terminé !",
        description: "Votre profil a été sauvegardé avec succès.",
      });

      router.push("/app");
      router.refresh();
    } catch (error) {
      console.error("[Onboarding] complete error:", error);
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de la sauvegarde.",
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
              <p className="text-sm text-muted-foreground">Configuration initiale</p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Étape {step} sur {totalSteps}
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="px-6 py-4 bg-background/50">
        <div className="max-w-2xl mx-auto">
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
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

export default OnboardingFlow;
