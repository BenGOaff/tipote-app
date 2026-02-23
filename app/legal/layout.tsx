// app/legal/layout.tsx
// Layout partagé pour les pages légales (publiques).

import Link from "next/link";
import { cookies } from "next/headers";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, RTL_LOCALES } from "@/i18n/config";
import type { SupportedLocale } from "@/i18n/config";
import { LegalLangSwitcher } from "@/components/legal/LegalLangSwitcher";

const NAV_LABELS: Record<string, Record<string, string>> = {
  fr: { cgu: "CGU", cgv: "CGV", privacy: "Confidentialité", mentions: "Mentions légales", cookies: "Cookies", back: "Retour à la connexion" },
  en: { cgu: "Terms of Use", cgv: "Terms of Sale", privacy: "Privacy", mentions: "Legal Notices", cookies: "Cookies", back: "Back to login" },
  es: { cgu: "Condiciones de uso", cgv: "Condiciones de venta", privacy: "Privacidad", mentions: "Aviso legal", cookies: "Cookies", back: "Volver al inicio" },
  it: { cgu: "Condizioni d'uso", cgv: "Condizioni di vendita", privacy: "Privacy", mentions: "Note legali", cookies: "Cookie", back: "Torna al login" },
  ar: { cgu: "شروط الاستخدام", cgv: "شروط البيع", privacy: "الخصوصية", mentions: "الإشعارات القانونية", cookies: "ملفات تعريف الارتباط", back: "العودة لتسجيل الدخول" },
};

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("ui_locale")?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as SupportedLocale) : DEFAULT_LOCALE;
  const isRtl = (RTL_LOCALES as readonly string[]).includes(locale);
  const labels = NAV_LABELS[locale] ?? NAV_LABELS.fr;

  return (
    <div className="min-h-screen bg-background" dir={isRtl ? "rtl" : "ltr"}>
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-foreground">
              Tipote<span className="text-primary">™</span>
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← {labels.back}
            </Link>
          </div>
          <LegalLangSwitcher current={locale} />
        </div>
        <nav className="max-w-4xl mx-auto px-4 pb-3 flex gap-4 text-sm">
          {(["cgu", "cgv", "privacy", "mentions", "cookies"] as const).map((slug) => (
            <Link
              key={slug}
              href={`/legal/${slug}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {labels[slug]}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      <footer className="border-t border-border mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Tipote™ — ETHILIFE SAS
        </div>
      </footer>
    </div>
  );
}
