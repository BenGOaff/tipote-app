// app/onboarding/OnboardingFlow.tsx
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
  // ÉCRAN 1 — Toi & ton business (doc onboarding)
  firstName: string; // -> business_profiles.first_name
  country: string; // -> country
  niche: string; // -> niche
  missionStatement: string; // -> mission
  maturity: string; // -> business_maturity
  biggestBlocker: string; // -> biggest_blocker

  // ÉCRAN 2 — Ta situation actuelle (doc onboarding)
  hasOffers: boolean | null; // -> has_offers
  offers: Offer[]; // -> offers (JSON)
  socialAudience: string; // -> audience_social
  socialLinks: SocialLink[]; // -> social_links (JSON, max 2)
  emailListSize: string; // -> audience_email (texte libre)
  weeklyHours: string; // -> time_available
  mainGoal90Days: string; // -> main_goal
  mainGoals: string[]; // -> main_goals (max 2)

  // ÉCRAN 3 — Ce qui te rend unique (doc onboarding)
  uniqueValue: string; // -> unique_value
  untappedStrength: string; // -> untapped_strength
  biggestChallenge: string; // -> biggest_challenge
  successDefinition: string; // -> success_definition
  clientFeedback: string[]; // -> recent_client_feedback (concat)
  preferredContentType: string; // -> content_preference
  tonePreference: string[]; // -> preferred_tone (concat)
}

const initialData: OnboardingData = {
  firstName: "",
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
      // 1) save answers
      await saveCurrent();

      // 2) mark onboarding completed
      await postJSON("/api/onboarding/complete");

      // 3) generate persona + pyramide d'offres + plan (IA niveau 1)
      // (backend existant: app/api/strategy/route.ts)
      await postJSON("/api/strategy");

      // 4) go to main dashboard
      router.push("/app");
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
            Réponds à quelques questions pour que je puisse créer ton persona, tes offres et un plan d’action adapté à ton business.
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
