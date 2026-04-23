"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function SupportFooter() {
  const t = useTranslations("supportFooter");
  return (
    <footer className="bg-card border-t border-border/50 mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 text-center">
        <p className="text-foreground/70 font-medium mb-1">
          {t("contact")}
        </p>
        <a
          href="mailto:hello@tipote.com"
          className="text-primary hover:text-primary/80 font-medium text-sm"
        >
          {t("contactCta")}
        </a>

        <div className="mt-8 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Tipote. {t("rights")}.</span>
          <div className="flex items-center gap-4">
            <Link href="/legal/conditions-utilisation" className="hover:text-foreground">
              {t("terms")}
            </Link>
            <Link href="/legal/politique-confidentialite" className="hover:text-foreground">
              {t("privacy")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
