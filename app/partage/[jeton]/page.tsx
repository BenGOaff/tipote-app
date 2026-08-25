// app/partage/[jeton]/page.tsx
//
// LA PAGE QUE VOIT CELUI QUI REÇOIT LE LIEN.
//
// Publique, et c'est le point : le cas le plus intéressant est le
// prospect à qui on montre son quiz DÉJÀ construit. Lui demander de
// s'inscrire pour découvrir ce qu'on lui propose reviendrait à lui
// demander de décider avant d'avoir vu.
//
// Elle montre, elle n'installe rien. Le bouton qui installe exige une
// session, et le dit avant d'être cliqué plutôt qu'après.
//
// -- LA LANGUE ---------------------------------------------------------
//
// Celle DU QUIZ PARTAGÉ, pas celle du navigateur : celui qui reçoit un
// quiz anglais lit l'anglais, sinon on ne le lui aurait pas envoyé. Le
// contenu du quiz, lui, ne change jamais de langue. La décision et les
// textes vivent dans lib/quiz/partageTextes.ts, et le composant client
// les lit une fois l'aperçu chargé.
//
// L'onglet, lui, se rend AVANT cet appel : il ne connaît donc que le
// `?lang=` de l'URL, et retombe sur l'anglais. Un titre d'onglet dans la
// mauvaise langue coûte moins qu'une requête de plus sur chaque
// ouverture de lien.

import type { Metadata } from "next";

import { languePartage, textesPartage } from "@/lib/quiz/partageTextes";
import { InstallerQuiz } from "./InstallerQuiz";

export const dynamic = "force-dynamic";

// Cette adresse ne doit jamais remonter dans un moteur de recherche :
// un lien de partage se donne, il ne se trouve pas.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  return {
    title: textesPartage(languePartage(lang, null)).surtitre,
    robots: { index: false, follow: false },
  };
}

export default async function PagePartage({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <InstallerQuiz jeton={jeton} />
    </main>
  );
}
