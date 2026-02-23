// components/legal/LegalLangSwitcher.tsx
// Sélecteur de langue simplifié pour les pages légales (publiques, sans auth).
"use client";

import { useRouter } from "next/navigation";

const LOCALES: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  ar: "العربية",
};

export function LegalLangSwitcher({ current }: { current: string }) {
  const router = useRouter();

  function switchTo(locale: string) {
    document.cookie = `ui_locale=${locale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(LOCALES).map(([code, label]) => (
        <button
          key={code}
          onClick={() => switchTo(code)}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            code === current
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
