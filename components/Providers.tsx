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
import { estSurfacePublique } from "@/lib/nav/surfacePublique";

type Props = {
  children: ReactNode;
  /** Vrai si on est servi depuis le sous-domaine affiliate.tipote.com
   *  (calculé côté serveur dans le root layout à partir du header host).
   *  Indispensable car sur ce sous-domaine le pathname client n'a PAS
   *  le préfixe /affiliate (rewrite next.config) → le gate pathname seul
   *  est mort et les widgets Tipote fuitent (drame Gwenn 8 juin 2026). */
  isAffiliateHost?: boolean;
  /** Le host servi, lu côté serveur dans le root layout.
   *  Sur le domaine perso d'une créatrice, le middleware réécrit vers
   *  `/s/<slug>` et le `usePathname()` du navigateur rend le chemin que
   *  le VISITEUR a tapé : le pathname seul ne peut donc pas voir qu'on
   *  est sur du contenu public. Le host, si. */
  host?: string;
};

export default function Providers({ children, isAffiliateHost = false, host }: Props) {
  // Gate les composants Tipote-spécifiques (tutoriel, coach IA) hors
  // du sous-domaine affiliate.tipote.com qui réutilise le même root
  // layout. L'espace affilié a son propre tutoriel + son propre support,
  // pas le tour Tipote dashboard. Cf. TODO.md section "Onboarding Tipote
  // leak sur affiliate" + INFRA.md pour le routing du sous-domaine.
  //
  // Double détection (robuste prod ET dev) :
  //   - PROD : host = affiliate.tipote.com → isAffiliateHost (server).
  //   - DEV  : path /affiliate/* servi en direct → pathname gate.
  const pathname = usePathname();
  const isAffiliateSpace =
    isAffiliateHost || (pathname?.startsWith("/affiliate") ?? false);

  // LE CHROME DE L'APP NE S'AFFICHE JAMAIS CHEZ UN VISITEUR
  // (retour Béné, 1er septembre 2026) : "le didacticiel s'ouvre sur la
  // version en ligne du quiz putain !! Le didacticiel ne concerne PAS
  // les visiteurs de quiz !!"
  //
  // Ces deux widgets étaient montés dans le layout RACINE, donc sur
  // toutes les pages, viewer public compris. Chacun portait ensuite sa
  // propre liste d'exceptions, et les deux listes ne disaient pas la
  // même chose : le coach se cachait bien sur "/q/", le didacticiel non.
  // Une liste oublie toujours le prochain écran ajouté. La règle vit
  // maintenant à UN endroit, pure et testée.
  //
  // (Le dépôt Tiquiz n'a pas ce défaut : il monte ces widgets dans
  // `AppShell`, qui n'enveloppe que les pages authentifiées. C'est la
  // bonne structure, à reprendre ici au prochain gros passage.)
  const surfacePublique = estSurfacePublique(pathname, host);

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
          {!isAffiliateSpace && !surfacePublique && (
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
