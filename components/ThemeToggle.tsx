// components/ThemeToggle.tsx
"use client";

// Sous-menu "Apparence" pour le UserAvatarMenu — light / dark /
// système. Utilise next-themes (déjà mounté dans Providers via
// `<ThemeProvider attribute="class" defaultTheme="system" />`) et
// rend une grille de 3 boutons radio cohérente avec la sémantique
// shadcn (DropdownMenuRadioGroup + DropdownMenuRadioItem).
//
// Pourquoi un sous-menu et pas un toggle bouton :
//   - On a 3 états (light / dark / system) — un simple bouton sun/moon
//     ne couvre pas le "system" qui suit la pref OS.
//   - Le sous-menu vit dans l'avatar dropdown qui est déjà le hub
//     "préférences user" (settings, logout, etc.) — pas besoin
//     d'inventer un slot supplémentaire dans le header.

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor, Palette } from "lucide-react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggleSubMenu() {
  const t = useTranslations("header.theme");
  const { theme, setTheme } = useTheme();
  // next-themes hydrate côté client uniquement → on évite un flash
  // SSR vs client en attendant le premier paint avant d'afficher la
  // valeur courante.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : "system";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <Palette className="mr-2 h-4 w-4" />
        {t("label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={current} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" className="cursor-pointer">
            <Sun className="mr-2 h-4 w-4" />
            {t("light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="cursor-pointer">
            <Moon className="mr-2 h-4 w-4" />
            {t("dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="cursor-pointer">
            <Monitor className="mr-2 h-4 w-4" />
            {t("system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
