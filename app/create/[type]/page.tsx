// app/create/[type]/page.tsx
// Génération de contenu (Niveau 2) + sauvegarde dans content_item
// ✅ Suite logique : pré-remplissage intelligent du brief basé sur business_profiles (+ plan si dispo)

import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppShell from '@/components/AppShell'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ContentGenerator } from '@/components/content/ContentGenerator'

type Props = {
  params: { type: string }
}

const TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  post: {
    label: 'Post réseaux sociaux',
    hint: 'Ex : un post LinkedIn éducatif avec un hook fort + CTA soft.',
  },
  email: {
    label: 'Email',
    hint: 'Ex : une newsletter courte, structurée, avec une histoire + point clé.',
  },
  blog: {
    label: 'Article / Blog',
    hint: 'Ex : un article structuré (intro, plan H2/H3, conclusion actionnable).',
  },
  video_script: {
    label: 'Script vidéo',
    hint: 'Ex : script 45–60s (hook, tension, valeur, CTA).',
  },
  sales_page: {
    label: 'Page de vente',
    hint: 'Ex : structure + copywriting (promesse, preuves, objection, offre).',
  },
  funnel: {
    label: 'Funnel / Tunnel',
    hint: 'Ex : étapes (lead magnet → nurture → offre) + messages clés.',
  },
}

function safeString(v: unknown) {
  return typeof v === 'string' ? v : ''
}

function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean)
}

function buildDefaultPrompt(args: {
  type: string
  profile: Record<string, unknown> | null
  planJson: unknown
}) {
  const { type, profile, planJson } = args

  const firstName = safeString(profile?.first_name) || safeString(profile?.firstName)
  const niche = safeString(profile?.niche)
  const mission = safeString(profile?.mission)
  const tone = safeString(profile?.tone_preference) || safeString(profile?.tonePreference)
  const goals = safeArray(profile?.main_goals).slice(0, 3)

  const baseContext = [
    firstName ? `Je m'appelle ${firstName}.` : '',
    niche ? `Ma niche : ${niche}.` : '',
    mission ? `Ma mission : ${mission}` : '',
    goals.length ? `Objectifs : ${goals.join(', ')}.` : '',
    tone ? `Ton souhaité : ${tone}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const planLine = planJson ? `Plan (résumé) : ${JSON.stringify(planJson).slice(0, 700)}` : ''

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
  }

  const inst = instructionsByType[type] ?? 'Génère un contenu actionnable, structuré, prêt à l’emploi.'

  // ⚠️ Le plan peut être lourd : on en met juste un extrait limité
  const lines = [
    baseContext ? `CONTEXTE\n${baseContext}` : '',
    planLine ? `\nCONTEXTE STRATÉGIE\n${planLine}` : '',
    `\nDEMANDE\n${inst}`,
    '\nCONTRAINTES\n- Écris en français\n- Style simple, pro, concret\n- Pas de bla-bla',
  ].filter(Boolean)

  return lines.join('\n')
}

export default async function CreateTypePage({ params }: Props) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/')

  const userEmail = session.user.email ?? ''

  const safeType = (params.type ?? '').trim().toLowerCase()
  const meta = TYPE_LABELS[safeType] ?? null

  if (!meta) {
    redirect('/create')
  }

  // 🔎 Contexte pour pré-remplir le brief
  const { data: profileRow } = await supabase
    .from('business_profiles')
    .select('first_name, niche, mission, main_goals, tone_preference')
    .eq('user_id', session.user.id)
    .maybeSingle()

  const { data: planRow } = await supabase
    .from('business_plan')
    .select('plan_json')
    .eq('user_id', session.user.id)
    .maybeSingle()

  const defaultPrompt = buildDefaultPrompt({
    type: safeType,
    profile: (profileRow ?? null) as unknown as Record<string, unknown> | null,
    planJson: (planRow?.plan_json ?? null) as unknown,
  })

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">Créer</p>
            <h1 className="mt-1 text-xl md:text-2xl font-semibold text-slate-900">{meta.label}</h1>
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

        <ContentGenerator type={params.type} defaultPrompt={defaultPrompt} />
      </div>
    </AppShell>
  )
}
