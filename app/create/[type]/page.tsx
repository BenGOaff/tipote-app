// app/create/[type]/page.tsx
// Génération de contenu (Niveau 2) + sauvegarde dans content_item (sans casser l'existant auth/onboarding)

import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ContentGenerator } from "@/components/content/ContentGenerator";

type Props = {
  params: { type: string };
};

const TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  post: {
    label: "Post réseaux sociaux",
    hint: "Ex : un post LinkedIn éducatif avec un hook fort + CTA soft.",
  },
  email: {
    label: "Email",
    hint: "Ex : une newsletter courte, structurée, avec une histoire + point clé.",
  },
  blog: {
    label: "Article / Blog",
    hint: "Ex : un article structuré (intro, plan H2/H3, conclusion actionnable).",
  },
  video_script: {
    label: "Script vidéo",
    hint: "Ex : script 45–60s (hook, tension, valeur, CTA).",
  },
  sales_page: {
    label: "Page de vente",
    hint: "Ex : structure + copywriting (promesse, preuves, objection, offre).",
  },
  funnel: {
    label: "Funnel / Tunnel",
    hint: "Ex : étapes (lead magnet → nurture → offre) + messages clés.",
  },
};

export default async function CreateTypePage({ params }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";
  const meta = TYPE_LABELS[params.type] ?? {
    label: "Génération",
    hint: "Décris ce que tu veux produire (objectif, audience, ton, contraintes).",
  };

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">Créer</p>
            <h1 className="mt-1 text-xl md:text-2xl font-semibold text-slate-900">
              {meta.label}
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">{meta.hint}</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/create"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              ← Retour
            </Link>
            <Link
              href="/contents"
              className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              Mes contenus
            </Link>
          </div>
        </div>

        <ContentGenerator type={params.type} />
      </div>
    </AppShell>
  );
}
