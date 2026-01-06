"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepGoals } from "./StepGoals";

export interface OnboardingData {
  // Step 1
  firstName: string;
  ageRange: string;
  gender: string;
  country: string;

  // Step 2
  niche: string;
  nicheOther: string;
  persona: string;
  businessType: string;
  businessTypeOther: string;
  businessMaturity: string;

  audienceSocial: string;
  audienceEmail: string;

  hasOffers: boolean;
  offerPrice: string;
  offerSalesCount: string;
  offerSalesPageLinks: string;

  toolsUsed: string[];
  toolsOther: string;

  timeAvailable: string;

  // Step 3
  financialGoal: string;
  psychologicalGoals: string[];
  psychologicalGoalsOther: string;
  contentPreference: string;
  preferredTone: string;
}

const defaultData: OnboardingData = {
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
};

export const OnboardingFlow = () => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateData = (updates: Partial<OnboardingData>) =>
    setData((prev) => ({ ...prev, ...updates }));

  const saveAnswers = async () => {
    const res = await fetch("/api/onboarding/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // ignore
      }
      throw new Error(json?.error || "Erreur sauvegarde onboarding");
    }
  };

  const handleComplete = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1) Sauvegarde réponses
      await saveAnswers();

      // 2) Marquer onboarding comme complété
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        let json: any = null;
        try {
          json = await res.json();
        } catch {
          // ignore
        }
        throw new Error(json?.error || "Impossible de finaliser l’onboarding");
      }

      // 3) Redirection
      router.replace("/dashboard");
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(err?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-12">
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {step === 0 && (
        <StepProfile data={data} updateData={updateData} onNext={() => setStep(1)} />
      )}

      {step === 1 && (
        <StepBusiness
          data={data}
          updateData={updateData}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <StepGoals
          data={data}
          updateData={updateData}
          onBack={() => setStep(1)}
          onComplete={handleComplete}
          isSubmitting={loading}
        />
      )}
    </div>
  );
};
