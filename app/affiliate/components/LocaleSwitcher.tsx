"use client";

// app/affiliate/components/LocaleSwitcher.tsx
//
// Sélecteur de langue d'INTERFACE du dashboard affilié. Même look & feel que
// le LanguageSwitcher de Tipote/Tiquiz (Select + globe + endonymes), mais
// câblé sur l'i18n affilié (PATCH /affiliate/api/profile puis refresh).
//
// On n'expose que les langues dont l'interface ET le contenu promo existent.
// Pour l'instant : FR + EN. On rouvrira les autres quand le contenu sera prêt
// (ajouter la locale ici + son dict + le contenu).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDict, useLocale } from "../i18n/context";
import type { AffiliateLocale } from "../i18n";

// Langues actuellement proposées à l'affilié (endonymes). Restreint à FR/EN
// tant que le contenu des autres marchés n'est pas prêt.
const ENABLED_LOCALES: { value: AffiliateLocale; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
];

export function LocaleSwitcher() {
  const t = useDict();
  const currentLocale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Si la locale courante n'est pas proposée (ex. vieux compte en "es"), on
  // l'affiche quand même dans le trigger pour ne pas mentir sur l'état réel.
  const value: AffiliateLocale = ENABLED_LOCALES.some((l) => l.value === currentLocale)
    ? currentLocale
    : "en";

  async function handleChange(next: string) {
    if (next === currentLocale || pending) return;
    setPending(true);
    try {
      await fetch("/affiliate/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      // Best effort : on refresh quand même au cas où le user re-tente.
    }
    router.refresh();
    setPending(false);
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        className="h-8 w-full gap-1.5 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus:ring-0"
        aria-label={t.locale_switcher.label}
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {ENABLED_LOCALES.map((l) => (
          <SelectItem key={l.value} value={l.value} className="text-xs">
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
