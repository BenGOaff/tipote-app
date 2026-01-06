"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepDeepDive } from "./StepDeepDive";
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
  mission: string;
  businessMaturity: string;

  offersStatus: string;
  offerNames: string;
  offerPriceRange: string;
  offerDelivery: string;

  audienceSize: string;
  emailListSize: string;
  timeAvailable: string;

  // Écran 3 - Deep dive (table business_profiles)
  energySource: string;
  uniqueValue: string;
  untappedStrategy: string;
  communication: string;
  successDefinition: string;
  sixMonthVision: string;

  innerDialogue: string;
  ifCertainSuccess: string;
  biggestFears: string;
  biggestChallenges: string;
  workingStrategy: string;
  recentClient: string;

  mainGoals: string[];
  mainGoalsOther: string;

  preferredContentTypes: string[];
  tonePreference: string;

  instagramUrl: string;
  tiktokUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
  websiteUrl: string;

  hasExistingBranding: boolean;

  biggestBlocker: string;
  additionalContext: string;
}

const initialData: OnboardingData = {
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

  energySource: "",
  uniqueValue: "",
  untappedStrategy: "",
  communication: "",
  successDefinition: "",
  sixMonthVision: "",

  innerDialogue: "",
  ifCertainSuccess: "",
  biggestFears: "",
  biggestChallenges: "",
  workingStrategy: "",
  recentClient: "",

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
  return (await res.json()) as T;
}

export function OnboardingFlow() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const progress = (step / totalSteps) * 100;

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // ✅ Save business_profiles (server-side)
      await postJSON("/api/onboarding/answers", data);

      // ✅ Generate plan + tasks
      await postJSON("/api/onboarding/complete", {});

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
        description: error instanceof Error ? error.message : "Impossible de sauvegarder votre profil.",
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
          {step === 1 && <StepProfile data={data} updateData={updateData} onNext={nextStep} />}
          {step === 2 && (
            <StepBusiness data={data} updateData={updateData} onNext={nextStep} onBack={prevStep} />
          )}
          {step === 3 && (
            <StepDeepDive data={data} updateData={updateData} onNext={nextStep} onBack={prevStep} />
          )}
          {step === 4 && (
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
}
