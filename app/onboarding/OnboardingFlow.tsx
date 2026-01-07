// app/onboarding/OnboardingFlow.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepGoals } from "./StepGoals";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";

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
  // Écran 1 - Toi & ton business
  firstName: string;
  country: string;
  niche: string;
  missionStatement: string;
  maturity: string;
  biggestBlocker: string;

  // Écran 2 - Ta situation actuelle
  hasOffers: boolean;
  offers: Offer[];
  socialAudience: string;
  socialLinks: SocialLink[];
  emailListSize: string;
  weeklyHours: string;
  mainGoal90Days: string;
  mainGoals: string[];

  // Écran 3 - Ce qui te rend unique
  uniqueValue: string;
  untappedStrength: string;
  biggestChallenge: string;
  successDefinition: string;
  clientFeedback: string;
  communicationStyle: string;
  preferredTones: string[];
}

const initialData: OnboardingData = {
  firstName: "",
  country: "",
  niche: "",
  missionStatement: "",
  maturity: "",
  biggestBlocker: "",

  hasOffers: false,
  offers: [],
  socialAudience: "",
  socialLinks: [],
  emailListSize: "",
  weeklyHours: "",
  mainGoal90Days: "",
  mainGoals: [],

  uniqueValue: "",
  untappedStrength: "",
  biggestChallenge: "",
  successDefinition: "",
  clientFeedback: "",
  communicationStyle: "",
  preferredTones: [],
};

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
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
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const saveCurrent = async () => {
    await postJSON("/api/onboarding/answers", data);
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
      await saveCurrent();
      await postJSON("/api/onboarding/complete");

      toast({
        title: "Onboarding terminé 🎉",
        description: "Ton profil est enregistré. On peut commencer !",
      });

      router.push("/dashboard");
      router.refresh();
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
            Réponds à quelques questions pour que je puisse t'aider à créer une stratégie et du contenu parfaitement adaptés à ton business.
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
