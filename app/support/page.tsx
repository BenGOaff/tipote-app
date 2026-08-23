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
  searchParams: Promise<{ lang?: string; produit?: string }>;
}) {
  // `?lang=` gagne sur le cookie : c'est l'app qui envoie (Tiquiz) qui
  // sait dans quelle langue sa cliente travaille. Sans ça, une visiteuse
  // sans compte Tipote n'a pas de cookie `ui_locale` sur ce domaine et
  // lit l'aide en français. Cf. lib/support/locale.ts.
  // `?produit=` pre-selectionne l'outil dans le formulaire de contact :
  // l'app qui envoie sait de quoi sa cliente parle, elle n'a pas a le
  // redire. Valeur libre, validee cote serveur au moment d'ecrire le
  // ticket (`lib/support/produit.ts` cote Tiquiz).
  const { lang, produit } = await searchParams;
  const locale = resolveHelpLocale(lang, await getLocale());
  return <SupportCenterClient locale={locale} produit={produit} />;
}
