"use client";

import { useLocale, useTranslations } from "next-intl";
import { SUPPORTED_LOCALES } from "@/i18n/config";

const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  ar: "العربية",
};

export default function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const currentLocale = useLocale();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value;
    document.cookie = `ui_locale=${locale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
    // Persist to DB (non-blocking)
    fetch("/api/settings/ui-locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    }).catch(() => {});
    window.location.reload();
  }

  return (
    <select
      value={currentLocale}
      onChange={handleChange}
      className="text-sm bg-background border border-input rounded-md px-2 py-1.5 cursor-pointer"
      aria-label={t("label")}
    >
      {SUPPORTED_LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_LABELS[loc] ?? loc}
        </option>
      ))}
    </select>
  );
}
