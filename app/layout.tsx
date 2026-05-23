// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "@/components/Providers";
import { HotjarTracker } from "@/components/HotjarTracker";
import { AffiliateTrialBanner } from "@/components/AffiliateTrialBanner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { RTL_LOCALES } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("rootTitle"),
    description: t("rootDescription"),
    icons: { icon: "/favicon.png" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = (RTL_LOCALES as string[]).includes(locale) ? "rtl" : "ltr";

  return (
    // suppressHydrationWarning : next-themes ajoute la classe `.dark`
    // sur <html> côté client avant la première peinture, ce qui crée
    // un mismatch SSR/client volontaire. Le warning React doit être
    // silencé sur cet élément précis (recommandation officielle
    // next-themes pour éviter le flash de thème incorrect).
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <HotjarTracker />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {/* Bandeau "trial Tipote actif" si user affilié en trial.
                Server component qui retourne null si pas applicable. */}
            <AffiliateTrialBanner />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
