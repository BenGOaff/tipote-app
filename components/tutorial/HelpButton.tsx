// components/tutorial/HelpButton.tsx
"use client";

import { HelpCircle, Book, Mail, Youtube, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <a
              href="https://www.youtube.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Youtube className="w-4 h-4" />
              Tutoriels vidéo
            </a>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <a
              href="https://www.facebook.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              Communauté
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <a href="mailto:hello@tipote.com" className="flex items-center gap-2 cursor-pointer">
              <Mail className="w-4 h-4" />
              Contact support
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
