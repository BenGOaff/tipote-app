// components/tutorial/WelcomeModal.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Sparkles, Rocket, Settings, Target, PenTool, ChevronRight } from "lucide-react";
import { useTutorial } from "@/hooks/useTutorial";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("tutorial");

  const [firstName, setFirstName] = useState("");

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
    setShowWelcome(false);
    setPhase("tour_today");
  };

  const handleSkip = () => {
    setShowWelcome(false);
    skipTutorial();
  };

  const handleOptOut = () => {
    setShowWelcome(false);
    setTutorialOptOut(true);
  };

  return (
    <Dialog
      open={showWelcome}
      onOpenChange={(open) => {
        setShowWelcome(open);

        if (!open && phase === "welcome" && !tutorialOptOut) {
          startTour();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-none">
        <VisuallyHidden>
          <DialogTitle>{t("welcomeTitle")}</DialogTitle>
          <DialogDescription>{t("welcomeA11y")}</DialogDescription>
        </VisuallyHidden>

        {/* Header gradient */}
        <div className="gradient-primary px-8 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>

          <h2 className="text-2xl font-bold text-primary-foreground mb-1">
            {t("welcomeHeading", { name: firstName || "" })}
          </h2>

          <p className="text-primary-foreground/90 text-base">
            {t("welcomeSubtitle")}
          </p>
        </div>

        {/* Body — what the tour covers */}
        <div className="px-8 py-6 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("welcomeBody")}
          </p>

          {/* Steps preview */}
          <div className="space-y-3">
            {[
              { icon: Rocket, label: t("welcomeStep1") },
              { icon: Settings, label: t("welcomeStep2") },
              { icon: Target, label: t("welcomeStep3") },
              { icon: PenTool, label: t("welcomeStep4") },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <step.icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm text-foreground">{step.label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="space-y-3 pt-2">
            <Button onClick={startTour} size="lg" className="w-full text-base gap-2">
              {t("welcomeStart")}
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button
              onClick={handleSkip}
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
            >
              {t("welcomeSkip")}
            </Button>
          </div>

          {/* Opt-out — clearly visible, separate section */}
          <div className="border-t pt-4">
            <button
              onClick={handleOptOut}
              className="w-full text-center text-xs text-muted-foreground/70 hover:text-primary underline underline-offset-2 transition-colors"
            >
              {t("welcomeOptOut")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
