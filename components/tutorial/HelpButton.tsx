// components/tutorial/HelpButton.tsx
"use client";

import { HelpCircle, RotateCcw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTutorial } from "@/hooks/useTutorial";
import { useTranslations } from "next-intl";

export function HelpButton() {
  const { tutorialOptOut, resetTutorial, setShowWelcome, setPhase } = useTutorial();
  const t = useTranslations("tutorial");

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-full w-12 h-12 shadow-lg shadow-primary/20">
            <HelpCircle className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              if (tutorialOptOut) {
                resetTutorial();
                return;
              }
              setShowWelcome(true);
              setPhase("welcome");
            }}
          >
            {tutorialOptOut ? (
              <RotateCcw className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {tutorialOptOut ? t("helpReactivate") : t("helpRestart")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
