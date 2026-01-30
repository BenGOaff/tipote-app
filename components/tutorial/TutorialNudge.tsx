// components/tutorial/TutorialNudge.tsx
"use client";

import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/hooks/useTutorial";

export function TutorialNudge() {
  const { tutorialOptOut, isLoading, setShowWelcome, setPhase } = useTutorial();

  // ✅ Si l'user a opt-out => on ne montre JAMAIS plus rien (pas de widget, pas de sidebar item)
  if (isLoading || tutorialOptOut) return null;

  return (
    <div className="mx-3 mb-3 rounded-lg border border-primary/15 bg-primary/10">
      <div className="px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <Rocket className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Petit tour guidé ?</p>
            <p className="text-xs text-muted-foreground">
              30 secondes pour savoir où cliquer (Aujourd&apos;hui → Créer → Stratégie)
            </p>
          </div>
        </div>

        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => {
              setShowWelcome(true);
              setPhase("welcome");
            }}
          >
            Lancer le tour
          </Button>
        </div>
      </div>
    </div>
  );
}
