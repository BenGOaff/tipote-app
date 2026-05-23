// components/Providers.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
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
  // Gate les composants Tipote-spécifiques (tutoriel, coach IA) hors
  // du sous-domaine affiliate.tipote.com qui réutilise le même root
  // layout. L'espace affilié a son propre tutoriel + son propre support,
  // pas le tour Tipote dashboard. Cf. TODO.md section "Onboarding Tipote
  // leak sur affiliate" + INFRA.md pour le routing du sous-domaine.
  const pathname = usePathname();
  const isAffiliateSpace = pathname?.startsWith("/affiliate") ?? false;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={0}>
        <TutorialProvider>
          {children}

          {/* Tutoriel + coach IA : Tipote-only, masqués sur l'espace affilié */}
          {!isAffiliateSpace && (
            <>
              <TutorialOverlay />
              <TutorialSpotlight
                elementId="coach"
                tooltipPosition="left"
                showNextButton
                className="fixed bottom-6 right-6 z-40 w-14 h-14 pointer-events-none"
              >
                <div />
              </TutorialSpotlight>
              <CoachWidget />
            </>
          )}
        </TutorialProvider>

        <ShadcnToaster />
        <SonnerToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
