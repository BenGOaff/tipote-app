// components/tutorial/HelpButton.tsx
"use client";

import { HelpCircle, Book } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTutorial } from "@/hooks/useTutorial";

export function HelpButton() {
  const { setPhase, setShowWelcome, tutorialOptOut } = useTutorial();

  if (tutorialOptOut) return null;

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
              setShowWelcome(true);
              setPhase("welcome");
            }}
          >
            <Book className="w-4 h-4" />
            Refaire le tour guidé
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
