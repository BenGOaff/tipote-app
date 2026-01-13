// components/tutorial/WelcomeModal.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sparkles, Rocket } from "lucide-react";
import { useTutorial } from "@/hooks/useTutorial";

export function WelcomeModal() {
  const {
    phase,
    showWelcome,
    setShowWelcome,
    setPhase,
    skipTutorial,
    tutorialOptOut,
    setTutorialOptOut,
  } = useTutorial();

  const [disableGuide, setDisableGuide] = useState<boolean>(tutorialOptOut);
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    setDisableGuide(tutorialOptOut);
  }, [tutorialOptOut]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", { method: "GET" });
        if (!res.ok) return;
        const json = await res.json();
        const profile = json?.profile;
        if (profile?.first_name) setFirstName(profile.first_name);
      } catch {
        // ignore
      }
    };

    if (showWelcome) loadProfile();
  }, [showWelcome]);

  const startTour = () => {
    if (disableGuide) {
      setTutorialOptOut(true);
      return;
    }
    setPhase("tour_today");
  };

  const handleStart = () => {
    setShowWelcome(false);
    startTour();
  };

  const handleSkip = () => {
    setShowWelcome(false);

    if (disableGuide) {
      setTutorialOptOut(true);
      return;
    }

    skipTutorial();
  };

  return (
    <Dialog
      open={showWelcome}
      onOpenChange={(open) => {
        setShowWelcome(open);

        // ✅ Si l'user ferme la modale via ESC / clic outside,
        // et qu'on est encore en welcome + pas opt-out => on démarre le tour.
        if (!open && phase === "welcome" && !tutorialOptOut) {
          startTour();
        }
      }}
    >
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-none">
        {/* ✅ A11y Radix: Title/Description obligatoires */}
        <VisuallyHidden>
          <DialogTitle>Bienvenue sur Tipote</DialogTitle>
          <DialogDescription>Tour guidé de prise en main de l’application</DialogDescription>
        </VisuallyHidden>

        <div className="gradient-primary p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>

          <h2 className="text-2xl font-bold text-primary-foreground mb-2">
            Bienvenue{firstName ? ` ${firstName}` : ""} ! 👋
          </h2>

          <p className="text-primary-foreground/90 text-lg mb-6">
            Je suis Tipote, ton partenaire business.
          </p>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Rocket className="w-5 h-5 text-primary-foreground" />
              <h3 className="text-lg font-semibold text-primary-foreground">Petit tour guidé ?</h3>
            </div>
            <p className="text-primary-foreground/80 leading-relaxed">
              En 30 secondes, je te montre où cliquer pour avancer vite (Aujourd&apos;hui → Créer → Stratégie).
            </p>

            <div className="mt-4 flex items-start gap-3 text-left">
              <Checkbox
                id="disable-guide"
                checked={disableGuide}
                onCheckedChange={(v) => setDisableGuide(Boolean(v))}
              />
              <Label
                htmlFor="disable-guide"
                className="text-primary-foreground/90 leading-snug cursor-pointer"
              >
                J&apos;ai mon Tipote en main, ne me montre plus ce guide
              </Label>
            </div>
          </div>

          <div className="space-y-3">
            <Button onClick={handleStart} variant="secondary" size="lg" className="w-full text-lg">
              C&apos;est parti !
            </Button>

            <Button
              onClick={handleSkip}
              variant="ghost"
              className="w-full text-primary-foreground/90 hover:text-primary-foreground hover:bg-white/10"
            >
              Pas maintenant
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
