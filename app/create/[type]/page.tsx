// app/create/[type]/page.tsx
// Génération de contenu (Niveau 2) + sauvegarde dans content_item
// ✅ Suite logique : pré-remplissage intelligent du brief basé sur business_profiles (+ plan si dispo)
// ✅ Templates rapides (via searchParams.template) pour type="post" (CDC)

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ContentGenerator } from "@/components/content/ContentGenerator";

type Props = {
  params: { type: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  post: {
    label: "Post réseaux sociaux",
    hint: "Ex : un post LinkedIn prêt à publier (hook fort, valeur, CTA soft).",
  },
  email: {
    label: "Email",
    hint: "Ex : objet + préheader + corps + CTA.",
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

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function buildTemplatePrompt(type: string, templateKey: string): string | null {
  const t = type.trim().toLowerCase();
  const k = templateKey.trim().toLowerCase();

  if (t !== "post") return null;

  const templates: Record<string, string> = {
    engagement:
      "TEMPLATE RAPIDE — Post Engagement\nObjectif : générer des commentaires.\nStructure : hook (question), contexte rapide, 2-3 points de valeur, 1 question finale très précise, CTA soft.\nContraintes : ton naturel, pas de blabla, 120–220 mots, emojis légers (0–3).",
    testimonial:
      "TEMPLATE RAPIDE — Témoignage Client\nObjectif : preuve sociale.\nStructure : situation (avant), action, résultat, leçon, CTA (inviter à DM / lien).\nContraintes : chiffres si possible, crédible, 140–240 mots, 1 punchline finale.",
    expert_tip:
      "TEMPLATE RAPIDE — Conseil Expert\nObjectif : expertise + confiance.\nStructure : hook (opinion tranchée), 3 conseils actionnables, mini-exemple, CTA (sauvegarder/partager).\nContraintes : concret, phrases courtes, 150–250 mots.",
    product_announce:
      "TEMPLATE RAPIDE — Annonce Produit\nObjectif : conversion.\nStructure : hook (nouveauté), problème, solution (offre), bénéfices, détails (dates/bonus), CTA clair.\nContraintes : pas agressif, orienté valeur, 140–230 mots.",
    behind_scenes:
      "TEMPLATE RAPIDE — Behind The Scenes\nObjectif : proximité + storytelling.\nStructure : scène (coulisses), difficulté, décision, leçon, CTA (question ou opinion).\nContraintes : authentique, 160–260 mots.",
    cta:
      "TEMPLATE RAPIDE — Call To Action\nObjectif : action immédiate.\nStructure : contexte (1–2 lignes), promesse, 3 bénéfices, objection traitée, CTA unique.\nContraintes : très clair, 90–170 mots.",
  };

  return templates[k] ?? null;
}

function buildDefaultPrompt(args: {
  type: string;
  profileRow: Record<string, unknown> | null;
  planJson: unknown;
}) {
  const type = args.type.trim().toLowerCase();
  const p = args.profileRow ?? {};

  const niche = safeString(p.niche);
  const mission = safeString(p.mission || p.persona_input);
  const goals = safeArray(p.goals || p.objectives || p.objectifs);
  const tone = safeString(p.tone || p.tone_preference);

  const baseContext = [
    niche ? `Ma niche : ${niche}.` : "",
    mission ? `Ma mission : ${mission}` : "",
    goals.length ? `Objectifs : ${goals.join(", ")}.` : "",
    tone ? `Ton souhaité : ${tone}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const planJson = args.planJson ?? null;
  const planLine = planJson ? `Plan (résumé) : ${JSON.stringify(planJson).slice(0, 700)}` : "";

  const instructionsByType: Record<string, string> = {
    post:
      "Génère un post prêt à publier (hook fort, valeur, preuve, CTA soft). Donne aussi 3 variantes d'accroche.",
    email:
      "Génère un email prêt à envoyer (objet + préheader + corps). Style clair, punchy, orienté conversion.",
    blog:
      "Génère un plan H2/H3 + intro + conclusion + points actionnables. Ton pédagogique, concret.",
    video_script:
      "Génère un script 45-60s (hook 0-3s, tension, valeur, CTA). Ajoute 3 idées de hooks.",
    sales_page:
      "Génère une structure de page de vente (promesse, preuves, objections, offre, bonus, FAQ, CTA).",
    funnel:
      "Propose un mini-funnel (lead magnet → nurture → offre) avec étapes + messages clés + CTA.",
  };

  const inst = instructionsByType[type] ?? "Génère un contenu actionnable, structuré, prêt à l’emploi.";

  // ⚠️ Le plan peut être lourd : on en met juste un extrait limité
  const lines = [
    baseContext ? `CONTEXTE\n${baseContext}` : "",
    planLine ? `\nSTRATÉGIE\n${planLine}` : "",
    `\nINSTRUCTIONS\n${inst}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export default async function CreateTypePage({ params, searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  const safeType = (params.type ?? "").trim().toLowerCase();
  const meta = TYPE_LABELS[safeType] ?? null;

  if (!meta) {
    redirect("/create");
  }

  // 🔎 Contexte pour pré-remplir le brief
  const { data: profileRow } = await supabase
    .from("business_profiles")
    .select("first_name, niche, mission, persona_input, goals, objectives, objectifs, tone, tone_preference")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const { data: planRow } = await supabase
    .from("business_plan")
    .select("plan_json")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const defaultPromptBase = buildDefaultPrompt({
    type: safeType,
    profileRow: (profileRow ?? null) as unknown as Record<string, unknown> | null,
    planJson: (planRow?.plan_json ?? null) as unknown,
  });

  // Template rapide (optionnel)
  const sp = searchParams ? await searchParams : undefined;
  const templateRaw = sp?.template;
  const templateKey = safeString(Array.isArray(templateRaw) ? templateRaw[0] : templateRaw).trim();
  const templatePrompt = templateKey ? buildTemplatePrompt(safeType, templateKey) : null;

  const defaultPrompt = templatePrompt ? `${defaultPromptBase}\n\n${templatePrompt}` : defaultPromptBase;

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">Créer</p>
            <h1 className="mt-1 text-xl md:text-2xl font-semibold text-slate-900">{meta.label}</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">{meta.hint}</p>

            {templatePrompt ? (
              <p className="mt-2 inline-flex items-center rounded-xl bg-[#b042b4]/10 px-3 py-1 text-xs font-semibold text-[#b042b4]">
                Template rapide activé
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/create"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              Retour
            </Link>
            <Link
              href="/contents"
              className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              Mes contenus
            </Link>
          </div>
        </div>

        <ContentGenerator type={params.type} defaultPrompt={defaultPrompt} />
      </div>
    </AppShell>
  );
}
