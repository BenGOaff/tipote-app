// app/onboarding/OnboardingQuestionnaire.tsx
// Typeform-style onboarding questionnaire — replaces the chat-based V2.
// ✅ One question at a time, animated transitions, conditional logic
// ✅ Multi-language via next-intl useTranslations('onboarding')
// ✅ Mobile-first, responsive, cross-browser compatible
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowRight, ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { callStrategySSE } from "@/lib/strategySSE";

// ─── Types ────────────────────────────────────────────────────────────────────

// Translator type — allows dynamic keys via any cast
type TFunc = ReturnType<typeof useTranslations> & {
  raw: (key: string) => unknown;
};

type StepId =
  | "firstName" | "revenueGoal" | "primaryGoal" | "businessObjectives"
  | "nicheArea" | "niche" | "clientProfile" | "timeAvailable" | "biggestBlocker"
  | "contentPreference" | "preferredTone" | "platforms" | "businessStatus"
  | "hasAlreadySold" | "satisfiedWithOffers" | "currentMonthlyRevenue"
  | "clientTestimonials" | "offers" | "salesPageUrls"
  | "commissionRate" | "monthlyCommissions"
  | "audienceEmail" | "audienceSocial" | "refusals";

type StepType =
  | "text" | "textarea" | "single" | "multiple" | "fill_in"
  | "client_profile" | "offers" | "yes_no_number";

interface StepDef {
  id: StepId;
  type: StepType;
  required?: boolean;
  condition?: (answers: Answers) => boolean;
  autoAdvance?: boolean; // single-choice auto-advance
}

interface OfferDetail {
  name: string;
  price: string;
  format: string;
  salesCount: string;
}

type AnswerValue = string | string[] | OfferDetail[] | Record<string, string> | null;

interface Answers {
  [key: string]: AnswerValue;
}

// ─── Step definitions ──────────────────────────────────────────────────────────

const STEPS: StepDef[] = [
  { id: "firstName", type: "text", required: true },
  { id: "revenueGoal", type: "single", autoAdvance: true },
  { id: "primaryGoal", type: "single", autoAdvance: true },
  { id: "businessObjectives", type: "multiple" },
  { id: "nicheArea", type: "single", autoAdvance: true },
  { id: "niche", type: "fill_in" },
  { id: "clientProfile", type: "client_profile" },
  { id: "timeAvailable", type: "single", autoAdvance: true },
  { id: "biggestBlocker", type: "multiple" },
  { id: "contentPreference", type: "multiple" },
  { id: "preferredTone", type: "multiple" },
  { id: "platforms", type: "multiple" },
  { id: "businessStatus", type: "single", autoAdvance: false },
  // Conditional
  {
    id: "hasAlreadySold", type: "single", autoAdvance: true,
    condition: (a) => a.businessStatus === "has_offers" || a.businessStatus === "affiliation",
  },
  {
    id: "satisfiedWithOffers", type: "single", autoAdvance: true,
    condition: (a) => a.businessStatus === "has_offers",
  },
  {
    id: "currentMonthlyRevenue", type: "single", autoAdvance: true,
    condition: (a) => a.businessStatus === "has_offers" || a.businessStatus === "affiliation",
  },
  {
    id: "clientTestimonials", type: "textarea",
    condition: (a) => a.businessStatus === "has_offers" && a.hasAlreadySold === "yes",
  },
  {
    id: "offers", type: "offers",
    condition: (a) => a.businessStatus === "has_offers",
  },
  {
    id: "salesPageUrls", type: "textarea",
    condition: (a) => a.businessStatus === "has_offers",
  },
  {
    id: "commissionRate", type: "text",
    condition: (a) => a.businessStatus === "affiliation",
  },
  {
    id: "monthlyCommissions", type: "text",
    condition: (a) => a.businessStatus === "affiliation",
  },
  {
    id: "audienceEmail", type: "yes_no_number",
    condition: (a) => a.businessStatus === "has_offers" || a.businessStatus === "affiliation",
  },
  {
    id: "audienceSocial", type: "yes_no_number",
    condition: (a) => a.businessStatus === "has_offers" || a.businessStatus === "affiliation",
  },
  { id: "refusals", type: "multiple" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getVisibleSteps(answers: Answers): StepDef[] {
  return STEPS.filter((s) => !s.condition || s.condition(answers));
}

function isStepComplete(step: StepDef, answers: Answers): boolean {
  const val = answers[step.id];
  if (!step.required) return true;
  if (step.type === "multiple") return Array.isArray(val) && val.length > 0;
  if (step.type === "fill_in") {
    const map = val as Record<string, string> | null;
    return !!(map?.nicheTarget && map?.nicheObjective);
  }
  if (step.type === "client_profile") {
    const map = val as Record<string, string> | null;
    return !!(map?.clientProblem);
  }
  if (step.type === "offers") return true; // optional
  if (step.type === "yes_no_number") {
    const map = val as Record<string, string> | null;
    return !!(map?.choice);
  }
  return typeof val === "string" && val.trim().length > 0;
}

function canContinue(step: StepDef, answers: Answers): boolean {
  if (!step.required) return true;
  return isStepComplete(step, answers);
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

// ─── Component ────────────────────────────────────────────────────────────────

export type OnboardingQuestionnaireProps = {
  firstName?: string | null;
};

const BOOT_STEPS_KEYS = ["step0", "step1", "step2", "step3"] as const;

export function OnboardingQuestionnaire({ firstName }: OnboardingQuestionnaireProps) {
  const t = useTranslations("onboarding") as TFunc;
  const router = useRouter();
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Answers>(() => ({
    firstName: firstName?.trim() || "",
  }));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [animating, setAnimating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const visibleSteps = useMemo(() => getVisibleSteps(answers), [answers]);
  const currentStep = visibleSteps[currentIdx] ?? visibleSteps[0];
  const totalSteps = visibleSteps.length;
  const progress = totalSteps > 0 ? Math.round(((currentIdx + 1) / totalSteps) * 100) : 0;
  const isLast = currentIdx >= totalSteps - 1;

  // Focus input on step change
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIdx]);

  // Boot animation during finalize
  useEffect(() => {
    if (!isFinalizing) return;
    const id = setInterval(() => {
      setBootStep((p: number) => Math.min(p + 1, BOOT_STEPS_KEYS.length - 1));
    }, 2500);
    return () => clearInterval(id);
  }, [isFinalizing]);

  const navigateTo = useCallback((targetIdx: number, dir: "forward" | "backward") => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setCurrentIdx(targetIdx);
      setAnimating(false);
    }, 180);
  }, [animating]);

  const goNext = useCallback(() => {
    if (isLast) return;
    // Re-compute visible steps after current answers (in case conditional changed)
    const nextVisible = getVisibleSteps(answers);
    const nextIdx = Math.min(currentIdx + 1, nextVisible.length - 1);
    navigateTo(nextIdx, "forward");
  }, [isLast, answers, currentIdx, navigateTo]);

  const goBack = useCallback(() => {
    if (currentIdx === 0) return;
    navigateTo(currentIdx - 1, "backward");
  }, [currentIdx, navigateTo]);

  const setAnswer = useCallback((stepId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  const handleSingleChoice = useCallback((step: StepDef, value: string) => {
    setAnswer(step.id, value);
    if (step.autoAdvance && !isLast) {
      setTimeout(() => {
        const nextVisible = getVisibleSteps({ ...answers, [step.id]: value });
        const nextIdx = Math.min(currentIdx + 1, nextVisible.length - 1);
        navigateTo(nextIdx, "forward");
      }, 220);
    }
  }, [setAnswer, isLast, answers, currentIdx, navigateTo]);

  const handleMultipleChoice = useCallback((stepId: string, value: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[stepId]) ? (prev[stepId] as string[]) : [];
      const exists = current.includes(value);
      return {
        ...prev,
        [stepId]: exists ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  }, []);

  const finalize = useCallback(async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    setBootStep(0);

    const safetyTimeout = setTimeout(() => router.replace("/app"), 90_000);

    try {
      // Build payload
      const a = answers;
      const nicheMap = a.niche as Record<string, string> | null;
      const clientMap = a.clientProfile as Record<string, string> | null;
      const emailMap = a.audienceEmail as Record<string, string> | null;
      const socialMap = a.audienceSocial as Record<string, string> | null;

      const payload: Record<string, unknown> = {
        firstName: a.firstName ?? "",
        revenueGoalMonthly: a.revenueGoal ?? null,
        primaryGoal: a.primaryGoal ?? null,
        businessObjectives: a.businessObjectives ?? [],
        nicheArea: a.nicheArea ?? null,
        nicheTarget: nicheMap?.nicheTarget ?? "",
        nicheObjective: nicheMap?.nicheObjective ?? "",
        nicheMechanism: nicheMap?.nicheMechanism ?? "",
        nicheTimeframe: nicheMap?.nicheTimeframe ?? "",
        clientProblem: clientMap?.clientProblem ?? "",
        clientPrevAttempts: clientMap?.clientPrevAttempts ?? "",
        clientFailures: clientMap?.clientFailures ?? "",
        clientFutureLife: clientMap?.clientFutureLife ?? "",
        timeAvailable: a.timeAvailable ?? null,
        biggestBlocker: a.biggestBlocker ?? [],
        contentPreference: a.contentPreference ?? [],
        preferredTone: a.preferredTone ?? [],
        platforms: a.platforms ?? [],
        businessStatus: a.businessStatus ?? "none",
        hasAlreadySold: a.hasAlreadySold ?? null,
        satisfiedWithOffers: a.satisfiedWithOffers ?? null,
        currentMonthlyRevenue: a.currentMonthlyRevenue ?? null,
        clientTestimonials: a.clientTestimonials ?? null,
        offers: a.offers ?? [],
        salesPageUrls: a.salesPageUrls ?? null,
        commissionRate: a.commissionRate ?? null,
        monthlyCommissions: a.monthlyCommissions ?? null,
        audienceEmail: emailMap?.choice === "yes" ? (emailMap?.count ?? "oui") : "non",
        audienceSocial: socialMap?.choice === "yes" ? (socialMap?.count ?? "oui") : "non",
        refusals: a.refusals ?? [],
      };

      // Determine whether user needs pyramid selection based on questionnaire answers.
      // This is the source of truth — NOT the DB state, which may be stale or empty.
      const bStatus = String(a.businessStatus ?? "none");
      const shouldShowPyramids = bStatus !== "has_offers" && bStatus !== "affiliation";

      // Step 0: Save answers & mark onboarding complete
      try {
        await postJSON("/api/onboarding/questionnaire", payload);
      } catch (err) {
        console.error("questionnaire save error:", err);
        // fail-open: try to mark complete anyway
        try {
          await postJSON("/api/onboarding/complete", { diagnosticCompleted: true });
        } catch {/* ignore */}
      }

      // Step 1: Generate strategy (SSE — generates offer pyramids when applicable)
      setBootStep(1);
      try {
        await callStrategySSE({ force: true });
      } catch {/* fail-open — pyramid selection page will retry if needed */}

      if (shouldShowPyramids) {
        // Redirect to pyramid selection page.
        // The selection page handles everything: load/retry pyramid generation,
        // user picks one, then full strategy + tasks + redirect to /app.
        clearTimeout(safetyTimeout);
        router.replace("/strategy/pyramids");
        return;
      }

      // Non-pyramid users (affiliates, users with offers): sync tasks → dashboard
      setBootStep(2);
      try {
        await Promise.race([
          postJSON("/api/tasks/sync", {}),
          new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 20_000)),
        ]);
      } catch {/* fail-open */}

      setBootStep(3);
      await new Promise((r) => setTimeout(r, 900));
      clearTimeout(safetyTimeout);
      router.replace("/app");
    } catch (e) {
      clearTimeout(safetyTimeout);
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Une erreur est survenue.",
        variant: "destructive",
      });
      setIsFinalizing(false);
    }
  }, [isFinalizing, answers, router, toast]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (currentStep?.type === "textarea") return; // allow newlines
      if (currentStep?.type === "single" || currentStep?.type === "multiple") return;
      e.preventDefault();
      if (canContinue(currentStep, answers)) {
        isLast ? finalize() : goNext();
      }
    }
  }, [currentStep, answers, isLast, finalize, goNext]);

  // ── Render boot overlay ────────────────────────────────────────────────────
  if (isFinalizing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          </div>
          <h2 className="text-xl font-semibold">{t("finalize.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(`finalize.${BOOT_STEPS_KEYS[bootStep]}`)}
          </p>
          <div className="mt-6 space-y-2">
            {BOOT_STEPS_KEYS.map((key, idx) => (
              <div key={key} className="flex items-center gap-3 text-sm">
                <div className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full transition-colors",
                  idx < bootStep ? "bg-primary" :
                  idx === bootStep ? "animate-pulse bg-primary/60" :
                  "bg-muted-foreground/20"
                )} />
                <span className={cn(idx === bootStep ? "text-foreground" : "text-muted-foreground")}>
                  {t(`finalize.${key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentStep) return null;

  const canGoNext = !currentStep || canContinue(currentStep, answers);

  return (
    <div className="flex min-h-dvh flex-col bg-background" onKeyDown={handleKeyDown}>
      {/* Top progress bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <Progress value={progress} className="h-1 rounded-none" />
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>{t("stepOf", { current: currentIdx + 1, total: totalSteps })}</span>
          {currentIdx > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("back")}
            </button>
          )}
        </div>
      </div>

      {/* Question area */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div
          className={cn(
            "w-full max-w-2xl transition-all",
            animating
              ? direction === "forward"
                ? "-translate-x-4 opacity-0"
                : "translate-x-4 opacity-0"
              : "translate-x-0 opacity-100",
          )}
          style={{ transitionDuration: "180ms" }}
        >
          <StepRenderer
            step={currentStep}
            answers={answers}
            t={t}
            onSingleChoice={handleSingleChoice}
            onMultipleChoice={handleMultipleChoice}
            onSetAnswer={setAnswer}
            inputRef={inputRef as React.RefObject<HTMLInputElement>}
          />

          {/* Continue / Finish button */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Primary action: shown for all non-auto-advance steps */}
            {(currentStep.type !== "single" || !currentStep.autoAdvance) && (
              <Button
                onClick={isLast ? finalize : goNext}
                disabled={!canGoNext}
                size="lg"
                className="gap-2 rounded-xl px-6"
              >
                {isLast ? t("finish") : t("continue")}
                {isLast ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
            )}

            {/* Skip link for non-required steps */}
            {!currentStep.required && (
              <button
                type="button"
                onClick={isLast ? finalize : goNext}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("skip")}
              </button>
            )}

            {/* Keyboard hint for text inputs */}
            {(currentStep.type === "text") && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {t("pressEnter")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step Renderer ────────────────────────────────────────────────────────────

interface StepRendererProps {
  step: StepDef;
  answers: Answers;
  t: TFunc;
  onSingleChoice: (step: StepDef, value: string) => void;
  onMultipleChoice: (stepId: string, value: string) => void;
  onSetAnswer: (stepId: string, value: AnswerValue) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

function StepRenderer({ step, answers, t, onSingleChoice, onMultipleChoice, onSetAnswer, inputRef }: StepRendererProps) {
  const sk = `steps.${step.id}` as const;

  switch (step.type) {
    case "text":
      return (
        <TextStep
          step={step}
          value={(answers[step.id] as string) ?? ""}
          onChange={(v) => onSetAnswer(step.id, v)}
          t={t}
          inputRef={inputRef}
        />
      );

    case "textarea":
      return (
        <TextareaStep
          step={step}
          value={(answers[step.id] as string) ?? ""}
          onChange={(v) => onSetAnswer(step.id, v)}
          t={t}
        />
      );

    case "single": {
      const optionKeys = Object.keys((t.raw(`steps.${step.id}.options`) as Record<string, string>) ?? {});
      return (
        <SingleChoiceStep
          step={step}
          optionKeys={optionKeys}
          selected={(answers[step.id] as string) ?? null}
          onSelect={(v) => onSingleChoice(step, v)}
          t={t}
        />
      );
    }

    case "multiple": {
      const optionKeys = Object.keys((t.raw(`steps.${step.id}.options`) as Record<string, string>) ?? {});
      return (
        <MultipleChoiceStep
          step={step}
          optionKeys={optionKeys}
          selected={(answers[step.id] as string[]) ?? []}
          onToggle={(v) => onMultipleChoice(step.id, v)}
          t={t}
        />
      );
    }

    case "fill_in":
      return (
        <FillInStep
          value={(answers[step.id] as Record<string, string>) ?? {}}
          onChange={(v) => onSetAnswer(step.id, v)}
          t={t}
        />
      );

    case "client_profile":
      return (
        <ClientProfileStep
          value={(answers[step.id] as Record<string, string>) ?? {}}
          onChange={(v) => onSetAnswer(step.id, v)}
          t={t}
        />
      );

    case "offers":
      return (
        <OffersStep
          value={(answers[step.id] as OfferDetail[]) ?? []}
          onChange={(v) => onSetAnswer(step.id, v)}
          t={t}
        />
      );

    case "yes_no_number":
      return (
        <YesNoNumberStep
          step={step}
          value={(answers[step.id] as Record<string, string>) ?? {}}
          onChange={(v) => onSetAnswer(step.id, v)}
          t={t}
        />
      );

    default:
      return null;
  }
}

// ─── Step sub-components ──────────────────────────────────────────────────────

interface TextStepProps {
  step: StepDef;
  value: string;
  onChange: (v: string) => void;
  t: TFunc;
  inputRef: React.RefObject<HTMLInputElement>;
}

function TextStep({ step, value, onChange, t, inputRef }: TextStepProps) {
  return (
    <div className="space-y-6">
      <QuestionHeader step={step} t={t} />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(`steps.${step.id}.placeholder` as any) as string}
        className="h-12 rounded-xl text-base"
        autoComplete="given-name"
      />
    </div>
  );
}

interface TextareaStepProps {
  step: StepDef;
  value: string;
  onChange: (v: string) => void;
  t: TFunc;
}

function TextareaStep({ step, value, onChange, t }: TextareaStepProps) {
  return (
    <div className="space-y-6">
      <QuestionHeader step={step} t={t} />
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(`steps.${step.id}.placeholder` as any) as string}
        className="min-h-[120px] rounded-xl text-base"
        rows={4}
      />
    </div>
  );
}

interface SingleChoiceStepProps {
  step: StepDef;
  optionKeys: string[];
  selected: string | null;
  onSelect: (v: string) => void;
  t: TFunc;
}

function SingleChoiceStep({ step, optionKeys, selected, onSelect, t }: SingleChoiceStepProps) {
  return (
    <div className="space-y-6">
      <QuestionHeader step={step} t={t} hint={t("singleChoice")} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {optionKeys.map((key) => {
          const label = t(`steps.${step.id}.options.${key}` as any) as string;
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all",
                active
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background hover:border-primary/50 hover:bg-muted/50 text-foreground"
              )}
            >
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}>
                {active && <Check className="h-3 w-3" />}
              </div>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MultipleChoiceStepProps {
  step: StepDef;
  optionKeys: string[];
  selected: string[];
  onToggle: (v: string) => void;
  t: TFunc;
}

function MultipleChoiceStep({ step, optionKeys, selected, onToggle, t }: MultipleChoiceStepProps) {
  return (
    <div className="space-y-6">
      <QuestionHeader step={step} t={t} hint={t("multipleChoice")} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {optionKeys.map((key) => {
          const label = t(`steps.${step.id}.options.${key}` as any) as string;
          const active = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all",
                active
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background hover:border-primary/50 hover:bg-muted/50 text-foreground"
              )}
            >
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}>
                {active && <Check className="h-3 w-3" />}
              </div>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FillInStepProps {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  t: TFunc;
}

function FillInStep({ value, onChange, t }: FillInStepProps) {
  const update = (key: string, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{t("steps.niche.question")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("steps.niche.description")}</p>
      </div>
      <div className="space-y-3">
        {[
          { key: "nicheTarget", label: "targetLabel", placeholder: "targetPlaceholder" },
          { key: "nicheObjective", label: "objectiveLabel", placeholder: "objectivePlaceholder" },
          { key: "nicheMechanism", label: "mechanismLabel", placeholder: "mechanismPlaceholder" },
          { key: "nicheTimeframe", label: "timeframeLabel", placeholder: "timeframePlaceholder" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="w-32 shrink-0 text-sm font-medium text-muted-foreground">
              {t(`steps.niche.${label}` as any) as string}
            </span>
            <Input
              value={value[key] ?? ""}
              onChange={(e) => update(key, e.target.value)}
              placeholder={t(`steps.niche.${placeholder}` as any) as string}
              className="h-10 rounded-xl flex-1 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ClientProfileStepProps {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  t: TFunc;
}

function ClientProfileStep({ value, onChange, t }: ClientProfileStepProps) {
  const update = (key: string, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{t("steps.clientProfile.question")}</h2>
      {[
        { key: "clientProblem", label: "problemLabel", placeholder: "problemPlaceholder", required: true },
        { key: "clientPrevAttempts", label: "prevAttemptsLabel", placeholder: "prevAttemptsPlaceholder" },
        { key: "clientFailures", label: "failuresLabel", placeholder: "failuresPlaceholder" },
        { key: "clientFutureLife", label: "futureLifeLabel", placeholder: "futurePlaceholder" },
      ].map(({ key, label, placeholder, required }) => (
        <div key={key} className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            {t(`steps.clientProfile.${label}` as any) as string}
            {required && <span className="ml-1 text-destructive">*</span>}
          </label>
          <Textarea
            value={value[key] ?? ""}
            onChange={(e) => update(key, e.target.value)}
            placeholder={t(`steps.clientProfile.${placeholder}` as any) as string}
            className="min-h-[80px] rounded-xl text-sm"
            rows={2}
          />
        </div>
      ))}
    </div>
  );
}

interface OffersStepProps {
  value: OfferDetail[];
  onChange: (v: OfferDetail[]) => void;
  t: TFunc;
}

const EMPTY_OFFER: OfferDetail = { name: "", price: "", format: "", salesCount: "" };

function OffersStep({ value, onChange, t }: OffersStepProps) {
  const offers = value.length > 0 ? value : [{ ...EMPTY_OFFER }];

  const updateOffer = (idx: number, field: keyof OfferDetail, v: string) => {
    const next = offers.map((o, i) => i === idx ? { ...o, [field]: v } : o);
    onChange(next);
  };

  const addOffer = () => {
    if (offers.length >= 3) return;
    onChange([...offers, { ...EMPTY_OFFER }]);
  };

  const removeOffer = (idx: number) => {
    onChange(offers.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{t("steps.offers.question")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("steps.offers.description")}</p>
      </div>
      <div className="space-y-4">
        {offers.map((offer, idx) => (
          <div key={idx} className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Offre {idx + 1}</span>
              {offers.length > 1 && (
                <button type="button" onClick={() => removeOffer(idx)} className="text-destructive hover:text-destructive/80 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">{t("offerName")}</label>
                <Input value={offer.name} onChange={(e) => updateOffer(idx, "name", e.target.value)} className="mt-1 h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("offerPrice")}</label>
                <Input type="number" value={offer.price} onChange={(e) => updateOffer(idx, "price", e.target.value)} className="mt-1 h-9 rounded-lg text-sm" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("offerFormat")}</label>
                <Input value={offer.format} onChange={(e) => updateOffer(idx, "format", e.target.value)} placeholder={t("offerFormatPlaceholder")} className="mt-1 h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("offerSalesCount")}</label>
                <Input value={offer.salesCount} onChange={(e) => updateOffer(idx, "salesCount", e.target.value)} className="mt-1 h-9 rounded-lg text-sm" placeholder="~" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {offers.length < 3 && (
        <button type="button" onClick={addOffer} className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors">
          <Plus className="h-4 w-4" />
          {t("addOffer")}
        </button>
      )}
    </div>
  );
}

interface YesNoNumberStepProps {
  step: StepDef;
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  t: TFunc;
}

function YesNoNumberStep({ step, value, onChange, t }: YesNoNumberStepProps) {
  const choice = value.choice ?? null;
  const count = value.count ?? "";

  return (
    <div className="space-y-6">
      <QuestionHeader step={step} t={t} hint={t("singleChoice")} />
      <div className="flex gap-3">
        {["yes", "no"].map((key) => {
          const label = t(`steps.${step.id}.options.${key}` as any) as string;
          const active = choice === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ choice: key, count: key === "no" ? "" : count })}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 px-5 py-3 text-sm font-medium transition-all",
                active ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50 text-foreground"
              )}
            >
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}>
                {active && <Check className="h-3 w-3" />}
              </div>
              {label}
            </button>
          );
        })}
      </div>
      {choice === "yes" && (
        <div className="mt-2">
          <Input
            type="number"
            value={count}
            onChange={(e) => onChange({ choice: "yes", count: e.target.value })}
            placeholder={t(`steps.${step.id}.countPlaceholder` as any) as string}
            className="h-11 max-w-xs rounded-xl text-base"
          />
        </div>
      )}
    </div>
  );
}

// ─── QuestionHeader ───────────────────────────────────────────────────────────

interface QuestionHeaderProps {
  step: StepDef;
  t: TFunc;
  hint?: string;
}

function QuestionHeader({ step, t, hint }: QuestionHeaderProps) {
  const rawStep = t.raw(`steps.${step.id}`) as Record<string, string>;
  const question = rawStep?.question ?? "";
  const description = rawStep?.description ?? "";

  return (
    <div>
      <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{question}</h2>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      )}
      {hint && !description && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export default OnboardingQuestionnaire;