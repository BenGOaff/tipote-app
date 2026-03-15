import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tipote — Le cerveau opérationnel de ton business",
  description:
    "Tipote combine stratégie, contenu, publication et analytics dans un seul système qui mémorise ton business. Fini la dispersion. Place aux résultats.",
};

export default function VenteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
