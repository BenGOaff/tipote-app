// components/pages/PageGenerateProgress.tsx
// Shows animated progress steps during page generation.
// Each step has a label, a loading spinner, and a check when done.

"use client";

import { useMemo } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export type ProgressStep = {
  id: string;
  label: string;
  progress: number;
  done?: boolean;
  templateId?: string;
};

type Props = {
  steps: ProgressStep[];
  error?: string | null;
};

export default function PageGenerateProgress({ steps, error }: Props) {
  const overallProgress = useMemo(() => {
    if (steps.length === 0) return 0;
    return Math.max(...steps.map((s) => s.progress));
  }, [steps]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md">
        {/* Animated header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            {error ? (
              <span className="text-2xl text-destructive">!</span>
            ) : overallProgress >= 100 ? (
              <CheckCircle2 className="w-8 h-8 text-primary" />
            ) : (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            )}
          </div>
          <h2 className="text-xl font-semibold mb-1">
            {error ? "Erreur" : overallProgress >= 100 ? "Ta page est prête !" : "Tipote crée ta page..."}
          </h2>
          <p className="text-sm text-muted-foreground">
            {error || (overallProgress >= 100 ? "Redirection vers l'éditeur..." : "Quelques secondes...")}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-muted rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Step list */}
        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${
                step.done ? "opacity-60" : "opacity-100"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              ) : (
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              )}
              <span className={step.done ? "line-through text-muted-foreground" : "font-medium"}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
