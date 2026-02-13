// app/create/[type]/page.tsx
// Génération de contenu (Niveau 2) + sauvegarde dans content_item
// ✅ Suite logique : pré-remplissage intelligent du brief basé sur business_profiles (+ plan si dispo)
// ✅ Templates rapides (via searchParams.template) pour type="post" (CDC)

// IMPORTANT: on force le mode dynamique (session Supabase + querystring + data dépend user)
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ContentGenerator } from "@/components/content/ContentGenerator";

type Props = {
  params: Promise<{ type: string }>;
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

function buildTemplatePrompt(templateKey: string): string | null {
  const k = templateKey.trim().toLowerCase();

  const templates: Record<string, string> = {
    engagement:
      "TEMPLATE RAPIDE — Post Engagement\nObjectif : générer des commentaires.\nStructure : hook question + 3–5 lignes de contexte + question finale.\nTon : direct, humain.\nContraintes : pas de blabla, 120–220 mots, emojis légers (0–3).",
    testimonial:
      "TEMPLATE RAPIDE — Témoignage Client\nObjectif : preuve sociale.\nStructure : situation → action → résultat → leçon + CTA soft.\nTon : crédible, concret.\nContraintes : 150–260 mots, 1 chiffre si possible, emojis 0–2.",
    expert_tip:
      "TEMPLATE RAPIDE — Conseil Expert\nObjectif : valeur instantanée.\nStructure : hook (mythe/erreur) → 3 conseils → mini checklist → CTA soft.\nTon : pédago, actionnable.\nContraintes : 160–260 mots, phrases courtes.",
    product_announce:
      "TEMPLATE RAPIDE — Annonce Produit\nObjectif : annoncer un lancement / promo / ouverture.\nStructure : hook + bénéfice principal → 3 points (quoi/pour qui/ce que ça change) → preuve/raison → CTA clair.\nTon : enthousiaste, concret.\nContraintes : 140–240 mots, 1 CTA max.",
    behind_scenes:
      "TEMPLATE RAPIDE — Behind The Scenes\nObjectif : humaniser + crédibilité.\nStructure : coulisses (ce que tu fais) → difficulté/apprentissage → leçon → CTA soft.\nTon : authentique.\nContraintes : 160–280 mots, 1 punchline.",
    cta:
      "TEMPLATE RAPIDE — Call To Action\nObjectif : pousser à l’action.\nStructure : problème → solution → bénéfices → objection → CTA.\nTon : direct, orienté résultat.\nContraintes : 120–200 mots, CTA clair.",
  };

  return templates[k] ?? null;
}

function buildDefaultPrompt(args: {
  type: string;
  profile?: any | null;
  plan?: any | null;
}) {
  const type = args.type;
  const profile = args.profile ?? null;
  const plan = args.plan ?? null;

  const profileName = safeString(profile?.business_name || profile?.nom_entreprise || "");
  const audience = safeString(profile?.audience || profile?.cible || "");
  const offer = safeString(profile?.offer || profile?.offre || "");
  const tone = safeString(profile?.tone || profile?.tonalite || profile?.tone_preference || "");
  const goals = safeArray(profile?.goals || profile?.objectifs || []);

  const planJson = plan?.plan_json ?? null;

  const lines: string[] = [];

  lines.push("BRIEF CONTEXTE");
  if (profileName) lines.push(`- Business : ${profileName}`);
  if (audience) lines.push(`- Audience : ${audience}`);
  if (offer) lines.push(`- Offre : ${offer}`);
  if (tone) lines.push(`- Ton préféré : ${tone}`);
  if (goals.length) lines.push(`- Objectifs : ${goals.slice(0, 6).join(", ")}`);

  if (planJson && typeof planJson === "object") {
    lines.push("- Plan stratégique : disponible (utilise-le si pertinent).");
  }

  lines.push("");
  lines.push("DEMANDE");
  lines.push(`Génère un contenu de type "${type}" prêt à publier. Donne un résultat directement utilisable.`);

  return lines.join("\n");
}

export default async function CreateTypePage(props: Props) {
  const { params: paramsPromise, searchParams } = props;
  const params = await paramsPromise;

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

  const sp = (await searchParams) ?? {};
  const templateKey = safeString(sp.template);

  const templatePrompt =
    safeType === "post" && templateKey ? buildTemplatePrompt(templateKey) : null;

  // 🔎 Contexte pour pré-remplir le brief (fail-open)
  let profileRow: any | null = null;
  let planRow: any | null = null;

  try {
    const { data } = await supabase
      .from("business_profiles")
      .select(
        "business_name, nom_entreprise, audience, cible, offer, offre, goals, objectifs, tone, tonalite, tone_preference",
      )
      .eq("user_id", session.user.id)
      .maybeSingle();
    profileRow = data ?? null;
  } catch {
    profileRow = null;
  }

  try {
    const { data } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", session.user.id)
      .maybeSingle();
    planRow = data ?? null;
  } catch {
    planRow = null;
  }

  const defaultPromptBase = buildDefaultPrompt({
    type: safeType,
    profile: profileRow,
    plan: planRow,
  });

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
              <p className="mt-2 inline-flex items-center rounded-full bg-[#b042b4]/10 px-3 py-1 text-xs font-semibold text-[#b042b4]">
                Template rapide activé
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation native (fiable), sans casser l’UI */}
            <form action="/create" method="get">
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
              >
                ← Retour
              </button>
            </form>

            <form action="/contents" method="get">
              <button
                type="submit"
                className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
              >
                Mes contenus
              </button>
            </form>
          </div>
        </div>

        <ContentGenerator type={params.type} defaultPrompt={defaultPrompt} />
      </div>
    </AppShell>
  );
}
