"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { SUPPORTED_LOCALES } from "@/i18n/config";

const LOCALE_LABELS: Record<string, string> = {
  fr: "FR",
  en: "EN",
  es: "ES",
  it: "IT",
  ar: "AR",
};

const TITLES: Record<string, string> = {
  fr: "Centre d'aide",
  en: "Help Center",
  es: "Centro de ayuda",
  it: "Centro assistenza",
  ar: "مركز المساعدة",
};

export default function SupportHeader({ locale }: { locale: string }) {
  return (
    <header className="bg-card border-b border-border/50 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/support" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[image:var(--gradient-primary)] flex items-center justify-center">
            <span className="text-white text-sm font-bold">T</span>
          </div>
          <span className="font-semibold text-foreground">
            Tipote <span className="text-muted-foreground font-normal">|</span>{" "}
            <span className="text-foreground/70 font-normal">{TITLES[locale] ?? TITLES.fr}</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Globe className="w-4 h-4" />
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  l === locale
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  document.cookie = `ui_locale=${l};path=/;max-age=31536000`;
                  window.location.reload();
                }}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>

          <Link
            href="/"
            className="text-sm text-primary hover:text-primary/80 font-medium hidden sm:block"
          >
            {locale === "fr" ? "Aller sur Tipote" :
             locale === "es" ? "Ir a Tipote" :
             locale === "it" ? "Vai a Tipote" :
             locale === "ar" ? "الذهاب إلى Tipote" :
             "Go to Tipote"} →
          </Link>
        </div>
      </div>
    </header>
  );
}
