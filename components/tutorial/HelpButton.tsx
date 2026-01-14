// components/tutorial/HelpButton.tsx
"use client";

import { HelpCircle, Book, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTutorial } from "@/hooks/useTutorial";

export function HelpButton() {
  const { tutorialOptOut, resetTutorial, setShowWelcome, setPhase } = useTutorial();

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-full w-14 h-14 shadow-lg shadow-primary/20">
            <HelpCircle className="w-6 h-6" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              // ✅ Si l’utilisateur a opt-out (ou bug localStorage), on force un reset propre
              if (tutorialOptOut) {
                resetTutorial();
                return;
              }

              // ✅ Sinon on relance le tour
              setShowWelcome(true);
              setPhase("welcome");
            }}
          >
            {tutorialOptOut ? <RotateCcw className="w-4 h-4" /> : <Book className="w-4 h-4" />}
            {tutorialOptOut ? "Réactiver le tour guidé" : "Refaire le tour guidé"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
