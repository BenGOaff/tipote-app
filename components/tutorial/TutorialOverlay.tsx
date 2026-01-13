// components/tutorial/TutorialOverlay.tsx
"use client";

import { useTutorial } from "@/hooks/useTutorial";
import { WelcomeModal } from "@/components/tutorial/WelcomeModal";
import { TourCompleteModal } from "@/components/tutorial/TourCompleteModal";

export function TutorialOverlay() {
  const { phase, isLoading } = useTutorial();

  if (isLoading) return null;

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
