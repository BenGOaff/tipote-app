// app/support/page.tsx
// Public help center — no auth required
import { getLocale, getTranslations } from "next-intl/server";
import SupportCenterClient from "@/components/support/SupportCenterClient";
import { resolveHelpLocale } from "@/lib/support/locale";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return {
    title: t("supportTitle"),
    description: t("supportDescription"),
  };
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  // `?lang=` gagne sur le cookie : c'est l'app qui envoie (Tiquiz) qui
  // sait dans quelle langue sa cliente travaille. Sans ça, une visiteuse
  // sans compte Tipote n'a pas de cookie `ui_locale` sur ce domaine et
  // lit l'aide en français. Cf. lib/support/locale.ts.
  const { lang } = await searchParams;
  const locale = resolveHelpLocale(lang, await getLocale());
  return <SupportCenterClient locale={locale} />;
}
