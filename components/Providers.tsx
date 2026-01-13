// components/Providers.tsx
"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TutorialProvider } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { HelpButton } from "@/components/tutorial/HelpButton";

type Props = {
  children: ReactNode;
};

export default function Providers({ children }: Props) {
  return (
    <TooltipProvider delayDuration={0}>
      <TutorialProvider>
        {children}
        <TutorialOverlay />
        <HelpButton />
      </TutorialProvider>

      {/* Toaster Shadcn (hook use-toast) */}
      <ShadcnToaster />
      {/* Toaster Sonner (notifications plus “riches”) */}
      <SonnerToaster />
    </TooltipProvider>
  );
}
