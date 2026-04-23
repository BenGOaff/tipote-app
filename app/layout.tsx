// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "@/components/Providers";
import { HotjarTracker } from "@/components/HotjarTracker";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { RTL_LOCALES } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("rootTitle"),
    description: t("rootDescription"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = (RTL_LOCALES as string[]).includes(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body className="font-sans antialiased">
        <HotjarTracker />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
