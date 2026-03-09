// components/tutorial/TutorialNudge.tsx
"use client";

import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/hooks/useTutorial";
import { useTranslations } from "next-intl";

export function TutorialNudge() {
  const { tutorialOptOut, isLoading, setShowWelcome, setPhase } = useTutorial();
  const t = useTranslations("tutorial");

  if (isLoading || tutorialOptOut) return null;

  return (
    <div className="mx-3 mb-3 rounded-lg border border-primary/15 bg-primary/5">
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <Rocket className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("nudgeTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("nudgeDesc")}
            </p>
          </div>
        </div>

        <div className="mt-2.5">
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => {
              setShowWelcome(true);
              setPhase("welcome");
            }}
          >
            {t("nudgeCta")}
          </Button>
        </div>
      </div>
    </div>
  );
}
