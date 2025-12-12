// app/create/page.tsx
// Page "Créer" v2.0 : hub unique pour choisir le type de contenu à générer

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const tiles = [
  { title: "Post réseaux sociaux", desc: "LinkedIn, Instagram, X…", tag: "Réseaux sociaux" },
  { title: "Email", desc: "Newsletter, séquence, relance…", tag: "Emails" },
  { title: "Article / Blog", desc: "Article optimisé et structuré", tag: "Contenus longs" },
  { title: "Script vidéo", desc: "Shorts, Reels, YouTube…", tag: "Vidéo" },
  { title: "Page de vente", desc: "Structure + copywriting", tag: "Offres" },
  { title: "Funnel / Tunnel", desc: "Étapes + messages clés", tag: "Funnels" },
];

export default async function CreatePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <section className="rounded-2xl bg-[#b042b4] text-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold bg-white/15 inline-flex px-2 py-1 rounded-full">
                Propulsé par IA
              </p>
              <h1 className="mt-3 text-xl md:text-2xl font-semibold">
                Quel type de contenu souhaitez-vous créer ?
              </h1>
              <p className="mt-2 text-sm text-white/90 max-w-2xl">
                L’IA utilisera vos paramètres d’onboarding et votre stratégie pour générer
                un contenu aligné (ton, offre, audience, objectifs).
              </p>
            </div>
            <Link
              href="/strategy"
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
            >
              Voir la stratégie
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <button
              key={t.title}
              type="button"
              className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow transition"
            >
              <p className="text-[11px] text-slate-500">{t.tag}</p>
              <h2 className="mt-2 text-sm font-semibold text-slate-900">{t.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{t.desc}</p>
              <p className="mt-4 inline-flex text-xs font-semibold text-[#b042b4]">
                Générer →
              </p>
            </button>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Prochaine étape (dev)</h3>
          <p className="mt-1 text-xs text-slate-600">
            On branchera ensuite : (1) récupération du profil + stratégie, (2) appel IA Niveau 2
            avec la clé utilisateur, (3) sauvegarde dans “Mes Contenus”.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
