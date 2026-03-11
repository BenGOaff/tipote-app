// components/tutorial/TourCompleteModal.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { PartyPopper, Sparkles, Settings, Target, Package, Users } from "lucide-react";
import { useTutorial } from "@/hooks/useTutorial";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function TourCompleteModal() {
  const { phase, setPhase, setTutorialOptOut } = useTutorial();
  const t = useTranslations("tutorial");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (phase === "tour_complete") setOpen(true);
  }, [phase]);

  const handleDone = () => {
    setOpen(false);
    setPhase("completed");
  };

  const handleGoSettings = () => {
    setOpen(false);
    setPhase("completed");
    router.push("/settings?tab=positioning");
  };

  const handleOptOut = () => {
    setTutorialOptOut(true);
    setOpen(false);
    setPhase("completed");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && phase === "tour_complete") {
          handleDone();
        }
      }}
    >
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-none">
        <VisuallyHidden>
          <DialogTitle>{t("completeTitle")}</DialogTitle>
          <DialogDescription>{t("completeA11y")}</DialogDescription>
        </VisuallyHidden>

        {/* Celebration header */}
        <div className="gradient-primary px-8 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-8 h-8 text-primary-foreground" />
          </div>

          <h2 className="text-2xl font-bold text-primary-foreground mb-2">
            {t("completeHeading")}
          </h2>

          <p className="text-primary-foreground/90 text-base leading-relaxed">
            {t("completeBody")}
          </p>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 space-y-4">
          {/* Primary: go to settings to complete profile */}
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">{t("completeTip")}</p>
            <p className="text-xs text-muted-foreground">{t("completeTipDesc")}</p>
            <div className="space-y-2">
              {[
                { icon: Package, label: t("completeTipOffers") },
                { icon: Target, label: t("completeTipPositioning") },
                { icon: Users, label: t("completeTipPersona") },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-xs text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleGoSettings} size="lg" className="w-full text-base gap-2">
            <Settings className="w-4 h-4" />
            {t("completeGoSettings")}
          </Button>

          <Button
            onClick={handleDone}
            variant="ghost"
            className="w-full text-muted-foreground"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {t("completeExplore")}
          </Button>

          {/* Clear opt-out — bright, visible, underlined */}
          <div className="border-t pt-4">
            <button
              onClick={handleOptOut}
              className="w-full text-center text-xs text-muted-foreground/70 hover:text-primary underline underline-offset-2 transition-colors"
            >
              {t("completeOptOut")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
