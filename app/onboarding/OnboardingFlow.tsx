"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepGoals } from "./StepGoals";

export type NicheValue = "argent" | "sante_bien_etre" | "dev_perso" | "relations" | "";
export type BusinessTypeValue = "physique" | "coaching" | "formation" | "saas" | "freelance" | "ecommerce" | "autre" | "";
export type RevenueMaturityValue = "0-500" | "500-5000" | "5000+" | "";
export type ContentPreferenceValue = "ecriture" | "video" | "";
export type GenderValue = "masculin" | "feminin" | "non_genre" | "prefere_ne_pas_repondre" | "";

export interface OnboardingData {
  // Écran 1 - Profil personnel
  firstName: string;
  ageRange: string;
  gender: GenderValue;
  country: string;

  // Écran 2 - Business
  niche: NicheValue;
  personaQuestion: string; // "Qui veux-tu aider à faire quoi et comment ?"
  businessType: BusinessTypeValue;
  businessTypeOther: string;
  revenueMaturity: RevenueMaturityValue;

  audienceSocial: string; // on garde string côté UI, cast côté API
  audienceEmail: string; // idem
  hasOffers: boolean;
  offerPriceRange: string;
  offerSalesCount: string;
  salesPageUrl: string;

  toolsUsed: string[];
  toolsOther: string;

  timeAvailable: string;

  // Écran 3 - Objectifs
  monthlyNetGoal: string;
  psychologicalGoals: string[];
  psychologicalGoalsOther: string;

  contentPreference: ContentPreferenceValue;
  preferredTone: string;
}

const DEFAULT_DATA: OnboardingData = {
  firstName: "",
  ageRange: "",
  gender: "",
  country: "",

  niche: "",
  personaQuestion: "",
  businessType: "",
  businessTypeOther: "",
  revenueMaturity: "",

  audienceSocial: "",
  audienceEmail: "",
  hasOffers: false,
  offerPriceRange: "",
  offerSalesCount: "",
  salesPageUrl: "",

  toolsUsed: [],
  toolsOther: "",

  timeAvailable: "",

  monthlyNetGoal: "",
  psychologicalGoals: [],
  psychologicalGoalsOther: "",

  contentPreference: "",
  preferredTone: "",
};

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(false);

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const canGoNextProfile = useMemo(() => {
    return true;
  }, []);

  const handleComplete = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    try {
      // 1) Save answers
      const res = await fetch("/api/onboarding/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[onboarding] /api/onboarding/answers failed", res.status, json);
        setLoading(false);
        return;
      }

      // 2) Mark onboarding complete (profil)
      const res2 = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json2 = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        console.error("[onboarding] /api/onboarding/complete failed", res2.status, json2);
        setLoading(false);
        return;
      }

      // 3) Redirect
      router.replace("/dashboard");
    } catch (e) {
      console.error("[onboarding] complete error", e);
    } finally {
      setLoading(false);
    }
  }, [data, loading, router]);

  return (
    <div className="min-h-screen bg-muted/30">
      {step === 0 && (
        <StepProfile
          data={data}
          updateData={updateData}
          onNext={() => setStep(1)}
          loading={loading}
        />
      )}

      {step === 1 && (
        <StepBusiness
          data={data}
          updateData={updateData}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
          loading={loading}
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
}
