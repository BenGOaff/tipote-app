// components/Providers.tsx
"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TutorialProvider } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { TutorialSpotlight } from "@/components/tutorial/TutorialSpotlight";
import { CoachWidget } from "@/components/coach/CoachWidget";

type Props = {
  children: ReactNode;
};

export default function Providers({ children }: Props) {
  return (
    <TooltipProvider delayDuration={0}>
      <TutorialProvider>
        {children}
        <TutorialOverlay />

        {/* Ancre fantôme pour le spotlight "coach" (même position que CoachWidget) */}
        <TutorialSpotlight
          elementId="coach"
          tooltipPosition="left"
          showNextButton
          className="fixed bottom-6 right-6 z-40 w-14 h-14 pointer-events-none"
        >
          <div />
        </TutorialSpotlight>

        {/* Coach (bas droite, z-50 au-dessus de l'ancre) */}
        <CoachWidget />
      </TutorialProvider>

      {/* Toaster Shadcn (hook use-toast) */}
      <ShadcnToaster />
      {/* Toaster Sonner (notifications plus "riches") */}
      <SonnerToaster />
    </TooltipProvider>
  );
}
