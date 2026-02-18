"use client";
// LanguageSwitcher — lets the user switch the app's interface language.
// Sets the ui_locale cookie immediately (for fast response) and persists to DB.
// Page reloads after switch so next-intl re-reads the new locale server-side.

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";

const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  ar: "العربية",
};

function setLocaleCookie(locale: string) {
  const maxAge = 365 * 24 * 60 * 60;
  document.cookie = `ui_locale=${locale}; path=/; max-age=${maxAge}; samesite=lax`;
}

async function persistLocaleToDb(locale: string) {
  try {
    await fetch("/api/settings/ui-locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui_locale: locale }),
    });
  } catch {
    // non-blocking — cookie is already set
  }
}

type Props = {
  /** "sidebar" = compact icon only; "settings" = full with label */
  variant?: "sidebar" | "settings";
};

export function LanguageSwitcher({ variant = "settings" }: Props) {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("languageSwitcher");
  const [, startTransition] = useTransition();

  const handleChange = (next: string) => {
    if (next === locale) return;
    setLocaleCookie(next);
    startTransition(() => {
      persistLocaleToDb(next).finally(() => {
        window.location.reload();
      });
    });
  };

  if (variant === "sidebar") {
    return (
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger
          className="h-8 w-full gap-1.5 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:ring-0"
          aria-label={t("label")}
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <SelectValue>{LANGUAGE_LABELS[locale]}</SelectValue>
        </SelectTrigger>
        <SelectContent side="right" align="end">
          {SUPPORTED_LOCALES.map((l) => (
            <SelectItem key={l} value={l} className="text-xs" dir={l === "ar" ? "rtl" : "ltr"}>
              {LANGUAGE_LABELS[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("label")}</p>
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger className="w-[220px]">
          <Globe className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue>{LANGUAGE_LABELS[locale]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LOCALES.map((l) => (
            <SelectItem key={l} value={l} dir={l === "ar" ? "rtl" : "ltr"}>
              {LANGUAGE_LABELS[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
