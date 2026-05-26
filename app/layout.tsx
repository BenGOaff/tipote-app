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
      {/* Polices display pour le studio visuel (typo "2026" : titres lourds,
          condensé, script d'accent). Chargées côté navigateur ; React 19
          hoiste ces <link> dans le <head>. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* App Router : le layout racine est le bon endroit (chargé sur toutes
          les pages) — la règle no-page-custom-font ne s'applique qu'au pages-router. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bebas+Neue&family=Caveat:wght@600;700&family=Montserrat:wght@400;500;600;700;800&family=Roboto:wght@700;900&display=swap"
      />
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
