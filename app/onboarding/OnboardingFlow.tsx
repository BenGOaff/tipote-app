"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { ampTrack } from "@/lib/telemetry/amplitude-client";

import { StepProfile } from "./StepProfile";
import { StepBusiness } from "./StepBusiness";
import { StepDiagnosticChat, type DiagnosticPayload } from "./StepDiagnosticChat";

/**
 * ✅ FIX COMPILATION ERROR:
 * StepBusiness imports `SocialLink` from "./OnboardingFlow".
 * We re-export SocialLink here to satisfy that import.
 */
export interface SocialLink {
  platform: string;
  url: string;
}

export interface Offer {
  name: string;
  price: string;
  description: string;
}

export interface OnboardingData {
  firstName: string;
  country: string;
  businessType: string;
  niche: string;
  missionStatement: string;
  businessModel: string;
  weeklyHours: string;
  revenueGoalMonthly: string;
  hasOffers: boolean;
  offers: Offer[];

  // Optional (compat) — only used if some step needs it
  socialLinks?: SocialLink[];

  diagnosticCompleted?: boolean;
  diagnosticAnswers?: Array<{ question: string; answer: string }>;
  diagnosticSummary?: string;
  diagnosticProfile?: Record<string, unknown> | null;

  onboardingVersion?: string;
}

const initialData: OnboardingData = {
  firstName: "",
  country: "France",
  businessType: "",
  niche: "",
  missionStatement: "",
  businessModel: "",
  weeklyHours: "",
  revenueGoalMonthly: "",
  hasOffers: false,
  offers: [],
  socialLinks: [],
  diagnosticCompleted: false,
  diagnosticAnswers: [],
  diagnosticSummary: "",
  diagnosticProfile: null,
  onboardingVersion: "v2_min_form+chat",
};

type AnyRecord = Record<string, any>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}

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

async function patchJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json as T;
}

function normalizeDiagnosticPayload(payload: DiagnosticPayload): {
  diagnosticAnswers: Array<{ question: string; answer: string }>;
  diagnosticProfile: Record<string, unknown> | null;
  diagnosticSummary: string;
} {
  const p = asRecord(payload) ?? {};
  const answersRaw = Array.isArray(p.answers) ? p.answers : Array.isArray(p.diagnosticAnswers) ? p.diagnosticAnswers : [];
  const diagnosticAnswers = answersRaw
    .map((a: any) => ({
      question: typeof a?.question === "string" ? a.question : "",
      answer: typeof a?.answer === "string" ? a.answer : "",
    }))
    .filter((x) => x.question.trim() && x.answer.trim());

  const diagnosticProfile = asRecord(p.diagnostic_profile ?? p.diagnosticProfile ?? p.profile ?? null);
  const diagnosticSummary =
    typeof p.diagnostic_summary === "string"
      ? p.diagnostic_summary
      : typeof p.diagnosticSummary === "string"
        ? p.diagnosticSummary
        : typeof p.summary === "string"
          ? p.summary
          : "";

  return {
    diagnosticAnswers,
    diagnosticProfile: diagnosticProfile ?? null,
    diagnosticSummary: diagnosticSummary ?? "",
  };
}

function buildOnboardingAnswersPayload(data: OnboardingData) {
  return {
    first_name: data.firstName,
    country: data.country,
    business_type: data.businessType,
    niche: data.niche,
    mission_statement: data.missionStatement,
    business_model: data.businessModel,
    weekly_hours: data.weeklyHours,
    revenue_goal_monthly: data.revenueGoalMonthly,
    has_offers: data.hasOffers,
    offers: data.offers ?? [],
    social_links: data.socialLinks ?? [],
  };
}

const OnboardingFlow = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [finalizing, setFinalizing] = useState(false);
  const [finalizingLabel, setFinalizingLabel] = useState("Préparation…");
  const [finalizingProgress, setFinalizingProgress] = useState(0);

  const updateData = (updates: Partial<OnboardingData>) => setData((prev) => ({ ...prev, ...updates }));

  const saveCurrent = async (fields: Partial<OnboardingData>) => {
    try {
      await postJSON("/api/onboarding/answers", {
        ...buildOnboardingAnswersPayload({ ...data, ...fields }),
        diagnostic_completed: Boolean(data.diagnosticCompleted),
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
      });
    } catch {
      // fail-open
    }
  };

  const nextStep = async () => {
    const next = Math.min(3, step + 1);

    ampTrack("tipote_onboarding_next_step", {
      step,
      next_step: next,
      onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
    });

    setStep(next);

    // best-effort save (non-bloquant)
    await saveCurrent({});
  };

  const prevStep = () => {
    const prev = Math.max(1, step - 1);

    ampTrack("tipote_onboarding_prev_step", {
      step,
      prev_step: prev,
      onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
    });

    setStep(prev);
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

      // ✅ on persiste diagnostic + toutes les réponses non-vides déjà saisies
      await postJSON("/api/onboarding/answers", {
        ...buildOnboardingAnswersPayload(data),
        diagnostic_answers: diagnostic.diagnosticAnswers ?? [],
        diagnostic_profile: diagnostic.diagnosticProfile ?? null,
        diagnostic_summary: diagnostic.diagnosticSummary ?? "",
        diagnostic_completed: true,
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
      });

      await postJSON("/api/onboarding/complete", { diagnostic_completed: true });

      ampTrack("tipote_onboarding_completed", {
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
        diagnostic_completed: true,
        diagnostic_answers_count: (diagnostic.diagnosticAnswers ?? []).length,
        has_diagnostic_profile: Boolean(diagnostic.diagnosticProfile),
        diagnostic_summary_len: (diagnostic.diagnosticSummary ?? "").length,
      });

      // ✅ Onboarding 3.0 : on finalise la stratégie + tâches AVANT d'envoyer vers le dashboard.
      // - On n'ajoute rien dans /app : le rendu reste Lovable.
      // - En cas d'erreur, fail-open : on redirige quand même vers /app.
      setFinalizing(true);
      setFinalizingLabel("Tipote prépare tes options…");
      setFinalizingProgress(20);

      try {
        // 1) Génère les pyramides (idempotent)
        await postJSON("/api/strategy", {});
        setFinalizingLabel("Choix automatique de la meilleure option…");
        setFinalizingProgress(45);

        // 2) Sélection automatique (index 0)
        await patchJSON("/api/strategy/offer-pyramid", { selectedIndex: 0 });
        setFinalizingLabel("Génération de ta stratégie + plan 90 jours…");
        setFinalizingProgress(70);

        // 3) Génère la stratégie complète (idempotent)
        await postJSON("/api/strategy", {});
        setFinalizingLabel("Presque fini…");
        setFinalizingProgress(90);
      } catch (e) {
        // fail-open : on ne bloque jamais l'accès à l'app
        console.error("Onboarding finalize strategy failed (non-blocking):", e);
      }

      setFinalizingProgress(100);
      router.push("/app");
      router.refresh();
    } catch (error) {
      ampTrack("tipote_onboarding_error", {
        onboarding_version: data.onboardingVersion ?? "v2_min_form+chat",
        message: error instanceof Error ? error.message : String(error),
        step,
      });

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
      {finalizing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
          <Card className="w-full max-w-lg p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">On finalise ton setup</p>
                <h2 className="text-lg md:text-xl font-semibold truncate">{finalizingLabel}</h2>
              </div>
            </div>

            <div className="mt-5">
              <Progress value={finalizingProgress} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">{finalizingProgress}%</p>
            </div>

            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Tipote génère ta stratégie, ton plan 90 jours et tes tâches. Tu arrives ensuite directement sur ton dashboard.
            </p>
          </Card>
        </div>
      ) : null}

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Ton onboarding</h1>
          <p className="text-muted-foreground">Quelques questions pour personnaliser Tipote™</p>
        </div>

        <div className="mb-8">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2 text-center">Étape {step} sur 3</p>
        </div>

        <div>
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
