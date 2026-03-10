// app/support/page.tsx
// Public help center — no auth required
import { getLocale } from "next-intl/server";
import SupportCenterClient from "@/components/support/SupportCenterClient";

export const metadata = {
  title: "Tipote — Centre d'aide",
  description: "Trouvez des réponses à toutes vos questions sur Tipote",
};

export default async function SupportPage() {
  const locale = await getLocale();
  return <SupportCenterClient locale={locale} />;
}
