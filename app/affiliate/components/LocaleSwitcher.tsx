"use client";

// app/affiliate/components/LocaleSwitcher.tsx
//
// Bouton dropdown pour changer la langue d'affichage du dashboard
// affilié. PATCH /affiliate/api/profile pour persister, puis reload.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useDict, useLocale } from "../i18n/context";
import type { AffiliateLocale } from "../i18n";

const LOCALES: { value: AffiliateLocale; flag: string }[] = [
  { value: "fr", flag: "🇫🇷" },
  { value: "en", flag: "🇬🇧" },
  { value: "es", flag: "🇪🇸" },
  { value: "it", flag: "🇮🇹" },
  { value: "pt", flag: "🇵🇹" },
  { value: "ar", flag: "🇸🇦" },
];

export function LocaleSwitcher() {
  const t = useDict();
  const currentLocale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState<AffiliateLocale | null>(null);

  async function handleSelect(locale: AffiliateLocale) {
    if (locale === currentLocale || loading) return;
    setLoading(locale);
    try {
      await fetch("/affiliate/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    } catch {
      // Best effort. On reload quand même au cas où le user re-tente.
    }
    router.refresh();
    setLoading(null);
  }

  const current = LOCALES.find((l) => l.value === currentLocale) ?? LOCALES[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1" title={t.locale_switcher.label}>
          <span className="text-base leading-none">{current.flag}</span>
          <Languages className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => handleSelect(l.value)}
            disabled={loading !== null}
            className="cursor-pointer gap-2"
          >
            <span className="text-base">{l.flag}</span>
            <span className="flex-1">{t.locale_switcher[l.value]}</span>
            {l.value === currentLocale && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
