// components/Providers.tsx
"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
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
    // ThemeProvider next-themes — `attribute="class"` ajoute la classe
    // `.dark` sur <html>, ce qui active toutes les CSS variables
    // surchargées dans `.dark { ... }` de globals.css. defaultTheme
    // "system" → respecte la pref OS au premier chargement, l'user
    // peut ensuite forcer light/dark/system via le toggle. enableSystem
    // active l'écoute du media query prefers-color-scheme.
    // disableTransitionOnChange évite un flash de transition pendant
    // le bascule (sinon les box-shadows / borders flashent en jaune).
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
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
    </ThemeProvider>
  );
}
