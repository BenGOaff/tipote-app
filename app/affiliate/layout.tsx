// app/affiliate/layout.tsx
//
// Layout imbriqué du dashboard affiliation. Le root layout fournit
// déjà <html>/<body> + Providers + next-intl + thème, donc on rajoute
// juste un wrapper minimal pour les pages /affiliate/*.
//
// La metadata par-page override le title/icons du root layout.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Tipote Affiliation",
    template: "%s · Tipote Affiliation",
  },
  description: "Espace affiliés Tipote — suivi des commissions, ressources promo, paliers de gain.",
  icons: {
    icon: [{ url: "/favicon.png", sizes: "any" }],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
