// components/tutorial/TutorialOverlay.tsx
"use client";

import { usePathname } from "next/navigation";
import { useTutorial } from "@/hooks/useTutorial";
import { WelcomeModal } from "@/components/tutorial/WelcomeModal";
import { TourCompleteModal } from "@/components/tutorial/TourCompleteModal";

export function TutorialOverlay() {
  const pathname = usePathname();
  const { phase, isLoading } = useTutorial();

  // ✅ Ne jamais afficher le didacticiel / overlay sur :
  // - login/public pages
  // - auth flows
  // - onboarding (sinon écran grisé en arrière-plan)
  //
  // Le didacticiel démarre au premier vrai "dashboard" (/app ou /dashboard),
  // puis peut continuer sur les pages de l'app (create/strategy/etc).
  const isBlockedRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding");

  if (isLoading) return null;
  if (isBlockedRoute) return null;

  const isInSpotlight =
    phase === "tour_today" || phase === "tour_create" || phase === "tour_strategy";

  return (
    <>
      <WelcomeModal />
      <TourCompleteModal />

      {isInSpotlight ? (
        <div
          className="fixed inset-0 bg-black/40 z-30 pointer-events-none transition-opacity duration-300"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
