// components/tutorial/TutorialOverlay.tsx
"use client";

import { useTutorial } from "@/hooks/useTutorial";
import { WelcomeModal } from "./WelcomeModal";
import { TourCompleteModal } from "./TourCompleteModal";

export function TutorialOverlay() {
  const { phase, isLoading } = useTutorial();

  if (isLoading) return null;

  const isInTour = phase === "tour_today" || phase === "tour_create" || phase === "tour_strategy";

  return (
    <>
      <WelcomeModal />
      <TourCompleteModal />

      {/* Overlay semi-transparent pour les phases de spotlight */}
      {isInTour && (
        <div
          className="fixed inset-0 bg-black/40 z-30 pointer-events-none transition-opacity duration-300"
          aria-hidden="true"
        />
      )}
    </>
  );
}
