// app/support/page.tsx
// Public help center — no auth required
import { getLocale, getTranslations } from "next-intl/server";
import SupportCenterClient from "@/components/support/SupportCenterClient";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return {
    title: t("supportTitle"),
    description: t("supportDescription"),
  };
}

export default async function SupportPage() {
  const locale = await getLocale();
  return <SupportCenterClient locale={locale} />;
}
