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
// En français, comme `/depart/`, et pour la même raison : c'est une page
// qu'on envoie à la main, à quelqu'un à qui on vient d'écrire. Le jour
// où un lien part vers un client anglophone, c'est un namespace
// `messages/` à ajouter, pas une page à réécrire.

import type { Metadata } from "next";

import { InstallerQuiz } from "./InstallerQuiz";

export const dynamic = "force-dynamic";

// Cette adresse ne doit jamais remonter dans un moteur de recherche :
// un lien de partage se donne, il ne se trouve pas.
export const metadata: Metadata = {
  title: "Un quiz vous a été partagé",
  robots: { index: false, follow: false },
};

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
