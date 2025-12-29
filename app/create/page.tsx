// app/create/page.tsx
// Page "Créer" v2.0 : hub unique pour choisir le type de contenu à générer
// + Templates rapides (Lovable + cahier des charges) : 6 raccourcis “1 clic” (post)

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const tiles = [
  {
    slug: "post",
    title: "Post réseaux sociaux",
    desc: "LinkedIn, Instagram, X…",
    tag: "Réseaux sociaux",
  },
  {
    slug: "email",
    title: "Email",
    desc: "Newsletter, séquence, relance…",
    tag: "Email",
  },
  {
    slug: "blog",
    title: "Article / Blog",
    desc: "Guides, tutoriels, SEO…",
    tag: "Blog",
  },
  {
    slug: "video_script",
    title: "Script vidéo",
    desc: "YouTube, Reels, TikTok…",
    tag: "Vidéo",
  },
  {
    slug: "sales_page",
    title: "Offre / Page de vente",
    desc: "Pitch, structure, copywriting…",
    tag: "Offres",
  },
  {
    slug: "funnel",
    title: "Funnel",
    desc: "Tunnels complets & séquences…",
    tag: "Funnels",
  },
] as const;

const quickTemplates = [
  {
    key: "engagement",
    title: "Post Engagement",
    desc: "Question pour engager l’audience",
    badge: "Post",
  },
  {
    key: "testimonial",
    title: "Témoignage Client",
    desc: "Mise en avant d’un succès client",
    badge: "Post",
  },
  {
    key: "expert_tip",
    title: "Conseil Expert",
    desc: "Partage d’expertise actionnable",
    badge: "Post",
  },
  {
    key: "product_announce",
    title: "Annonce Produit",
    desc: "Lancement / promo / ouverture",
    badge: "Post",
  },
  {
    key: "behind_scenes",
    title: "Behind The Scenes",
    desc: "Coulisses + story + leçon",
    badge: "Post",
  },
  {
    key: "cta",
    title: "Call To Action",
    desc: "Invitation claire à passer à l’action",
    badge: "Post",
  },
] as const;

export default async function CreatePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail} headerTitle="Créer">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Hero Lovable */}
        <section className="rounded-2xl bg-gradient-to-br from-[#b042b4] to-[#6b46c1] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold bg-white/15 px-2 py-1 rounded-full">
                Propulsé par IA
              </p>
              <h1 className="mt-3 text-xl md:text-2xl font-semibold">
                Quel type de contenu souhaitez-vous créer ?
              </h1>
              <p className="mt-2 text-sm text-white/90 max-w-2xl">
                L’IA utilisera vos paramètres d’onboarding et votre stratégie pour générer un
                contenu aligné (ton, offre, audience, objectifs).
              </p>
            </div>

            {/* CONSOLIDATION: hard-nav (full reload) pour éviter les blocages silencieux App Router */}
            <a
              href="/strategy"
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
            >
              Voir la stratégie
            </a>
          </div>
        </section>

        {/* Grille types (Lovable) */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            // CONSOLIDATION: hard-nav pour rendre visible toute erreur/redirect côté /create/[type]
            <a
              key={t.slug}
              href={`/create/${t.slug}`}
              className="block text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow transition"
            >
              <p className="text-[11px] text-slate-500">{t.tag}</p>
              <h2 className="mt-2 text-sm font-semibold text-slate-900">{t.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{t.desc}</p>
              <p className="mt-4 inline-flex text-xs font-semibold text-[#b042b4]">Générer →</p>
            </a>
          ))}
        </section>

        {/* Templates rapides (Lovable / CDC) */}
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Templates rapides</h2>
              <p className="mt-1 text-sm text-slate-500">Génération en 1 clic (brief pré-rempli).</p>
            </div>

            {/* CONSOLIDATION: hard-nav */}
            <a
              href="/create/post"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              Tous les posts →
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickTemplates.map((tpl) => (
              // CONSOLIDATION: on remplace href object (Pages Router) par une URL string App Router
              <a
                key={tpl.key}
                href={`/create/post?template=${encodeURIComponent(tpl.key)}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500">{tpl.badge}</p>
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">{tpl.title}</h3>
                    <p className="mt-1 text-xs text-slate-600">{tpl.desc}</p>
                  </div>

                  <span className="shrink-0 rounded-xl bg-[#b042b4]/10 px-2 py-1 text-[11px] font-semibold text-[#b042b4]">
                    1 clic
                  </span>
                </div>

                <p className="mt-4 inline-flex text-xs font-semibold text-[#b042b4]">Générer →</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
