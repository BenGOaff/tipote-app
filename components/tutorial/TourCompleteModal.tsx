// components/tutorial/TourCompleteModal.tsx
"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PartyPopper, Sparkles } from "lucide-react";
import { useTutorial } from "@/hooks/useTutorial";
import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function TourCompleteModal() {
  const { phase, setPhase, tutorialOptOut, setTutorialOptOut } = useTutorial();
  const [isOpen, setIsOpen] = useState(false);
  const [disableGuide, setDisableGuide] = useState<boolean>(tutorialOptOut);

  useEffect(() => {
    if (phase === "tour_complete") setIsOpen(true);
  }, [phase]);

  useEffect(() => {
    setDisableGuide(tutorialOptOut);
  }, [tutorialOptOut]);

  const handleClose = () => {
    if (disableGuide) setTutorialOptOut(true);
    setIsOpen(false);
    setPhase("completed");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-none">
        <div className="gradient-primary p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
            <PartyPopper className="w-8 h-8 text-primary-foreground" />
          </div>

          <h2 className="text-2xl font-bold text-primary-foreground mb-2">Tour terminé ! 🎉</h2>

          <p className="text-primary-foreground/90 text-lg mb-6">
            Tu peux maintenant explorer Tipote. Je suis là si tu as besoin.
          </p>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
            <div className="mt-1 flex items-start gap-3 text-left">
              <Checkbox
                id="disable-guide-complete"
                checked={disableGuide}
                onCheckedChange={(v) => setDisableGuide(Boolean(v))}
              />
              <Label
                htmlFor="disable-guide-complete"
                className="text-primary-foreground/90 leading-snug cursor-pointer"
              >
                J&apos;ai mon Tipote en main, ne me montre plus ce guide
              </Label>
            </div>
          </div>

          <Button onClick={handleClose} variant="secondary" size="lg" className="w-full text-lg">
            <Sparkles className="w-5 h-5 mr-2" />
            C&apos;est parti !
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
