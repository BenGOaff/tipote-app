'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ContentGenerator } from '@/components/content/ContentGenerator'

type Props = {
  /**
   * Contexte server (fail-open). On passe des objets bruts Supabase (any) pour éviter
   * des dépendances de types côté client.
   */
  profile: any | null
  plan: any | null
}

type Tile = {
  slug: 'post' | 'email' | 'blog' | 'video_script' | 'sales_page' | 'funnel'
  title: string
  desc: string
  tag: string
  gradient: string
}

const tiles: Tile[] = [
  {
    slug: 'post',
    title: 'Réseaux sociaux',
    desc: 'Posts LinkedIn, Instagram, X…',
    tag: 'Social',
    gradient: 'bg-gradient-to-br from-[#b042b4] to-[#6b46c1]',
  },
  {
    slug: 'email',
    title: 'Email',
    desc: 'Newsletters, séquences, relance…',
    tag: 'Email',
    gradient: 'bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]',
  },
  {
    slug: 'blog',
    title: 'Blog',
    desc: 'Articles SEO, guides, tutoriels…',
    tag: 'Blog',
    gradient: 'bg-gradient-to-br from-[#0ea5e9] to-[#22c55e]',
  },
  {
    slug: 'video_script',
    title: 'Vidéo',
    desc: 'Scripts YouTube, Reels, TikTok…',
    tag: 'Script',
    gradient: 'bg-gradient-to-br from-[#f97316] to-[#ef4444]',
  },
  {
    slug: 'sales_page',
    title: 'Offre',
    desc: 'Structure, copywriting, objections…',
    tag: 'Vente',
    gradient: 'bg-gradient-to-br from-[#111827] to-[#334155]',
  },
  {
    slug: 'funnel',
    title: 'Funnel',
    desc: 'Tunnel complet + messages clés…',
    tag: 'Tunnel',
    gradient: 'bg-gradient-to-br from-[#10b981] to-[#06b6d4]',
  },
]

const quickTemplates = [
  { key: 'engagement', title: 'Post Engagement', desc: 'Question pour engager l’audience' },
  { key: 'testimonial', title: 'Témoignage Client', desc: 'Mise en avant d’un succès client' },
  { key: 'expert_tip', title: 'Conseil Expert', desc: 'Partage d’expertise actionnable' },
  { key: 'product_announce', title: 'Annonce Produit', desc: 'Lancement / promo / ouverture' },
  { key: 'behind_scenes', title: 'Behind The Scenes', desc: 'Coulisses + story + leçon' },
  { key: 'cta', title: 'Call To Action', desc: 'Invitation claire à passer à l’action' },
] as const

function safeString(v: unknown) {
  return typeof v === 'string' ? v : ''
}

function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean)
}

function buildTemplatePrompt(templateKey: string): string | null {
  const k = templateKey.trim().toLowerCase()

  const templates: Record<string, string> = {
    engagement:
      "TEMPLATE RAPIDE — Post Engagement\nObjectif : générer des commentaires et des réponses.\nStructure : Hook (question) → Contexte perso → Question ouverte → CTA soft.\nContraintes : ton naturel, une seule question principale, pas de jargon.",
    testimonial:
      "TEMPLATE RAPIDE — Témoignage Client\nStructure : Situation → Action → Résultat → Preuve → Invitation.\nContraintes : concret, chiffres si possible, pas d'hyperbole.",
    expert_tip:
      "TEMPLATE RAPIDE — Conseil Expert\nStructure : Hook → 3 points actionnables → Exemple → Mini-CTA.\nContraintes : phrases courtes, orienté action.",
    product_announce:
      "TEMPLATE RAPIDE — Annonce Produit\nStructure : Hook → Problème → Solution → Détails (quoi/pour qui) → Bonus → CTA.\nContraintes : clair, bénéfices avant features.",
    behind_scenes:
      "TEMPLATE RAPIDE — Behind The Scenes\nStructure : Contexte → Coulisses → Leçon → Application → CTA soft.\nContraintes : authentique, storytelling simple.",
    cta:
      "TEMPLATE RAPIDE — Call To Action\nStructure : Hook → 1 idée forte → 1 preuve → CTA explicite.\nContraintes : direct, pas de paragraphes longs.",
  }

  return templates[k] ?? null
}

function buildDefaultPrompt(args: { type: string; profile?: any | null; plan?: any | null }) {
  const type = args.type
  const profile = args.profile ?? null
  const plan = args.plan ?? null

  const profileName = safeString(profile?.business_name || profile?.nom_entreprise || '')
  const audience = safeString(profile?.audience || profile?.cible || '')
  const offer = safeString(profile?.offer || profile?.offre || '')
  const tone = safeString(profile?.tone || profile?.tonalite || profile?.tone_preference || '')
  const goals = safeArray(profile?.goals || profile?.objectifs || [])

  const planJson = plan?.plan_json ?? null

  const lines: string[] = []
  lines.push('BRIEF CONTEXTE')
  if (profileName) lines.push(`- Business : ${profileName}`)
  if (audience) lines.push(`- Audience : ${audience}`)
  if (offer) lines.push(`- Offre : ${offer}`)
  if (tone) lines.push(`- Ton préféré : ${tone}`)
  if (goals.length) lines.push(`- Objectifs : ${goals.slice(0, 6).join(', ')}`)
  if (planJson && typeof planJson === 'object') {
    lines.push('- Plan stratégique : disponible (utilise-le si pertinent).')
  }

  lines.push('')
  lines.push('DEMANDE')
  lines.push(`Génère un contenu de type "${type}" prêt à publier. Donne un résultat directement utilisable.`)

  return lines.join('\n')
}

export function CreateHub({ profile, plan }: Props) {
  const [selectedType, setSelectedType] = useState<Tile['slug'] | null>(null)
  const [templateKey, setTemplateKey] = useState<string>('')

  const defaultPrompt = useMemo(() => {
    if (!selectedType) return ''
    const base = buildDefaultPrompt({ type: selectedType, profile, plan })
    const tpl = selectedType === 'post' && templateKey ? buildTemplatePrompt(templateKey) : null
    return tpl ? `${base}\n\n${tpl}` : base
  }, [selectedType, templateKey, profile, plan])

  return (
    <div className="space-y-6">
      {/* Header local (Lovable) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {selectedType && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedType(null)
                setTemplateKey('')
              }}
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500">Créer</p>
            <h1 className="text-lg font-semibold text-slate-900">
              {selectedType ? 'Paramètres de génération' : 'Quel contenu veux-tu créer ?'}
            </h1>
          </div>
        </div>

        <Link href="/contents">
          <Button className="rounded-xl bg-[#b042b4] text-white hover:opacity-95">Mes contenus</Button>
        </Link>
      </div>

      {!selectedType ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: choices */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">Types de contenu</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {tiles.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => setSelectedType(t.slug)}
                    className="text-left group"
                  >
                    <Card className="p-4 hover:shadow-md transition-all duration-200 group-hover:border-primary/50">
                      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-4', t.gradient)}>
                        <span className="text-primary-foreground text-xs font-bold">{t.tag}</span>
                      </div>
                      <h4 className="text-base font-bold mb-1 group-hover:text-primary transition-colors">
                        {t.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">{t.desc}</p>
                    </Card>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-bold">Templates rapides</h3>
                  <p className="text-sm text-muted-foreground">Génération en 1 clic (posts)</p>
                </div>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setSelectedType('post')
                    setTemplateKey('')
                  }}
                >
                  Tous les posts →
                </Button>
              </div>

              <div className="grid gap-3">
                {quickTemplates.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => {
                      setSelectedType('post')
                      setTemplateKey(tpl.key)
                    }}
                    className="text-left"
                  >
                    <Card className="p-4 hover:shadow-md transition-all duration-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-semibold mb-1">{tpl.title}</h4>
                          <p className="text-sm text-muted-foreground">{tpl.desc}</p>
                        </div>
                        <span className="shrink-0 rounded-xl bg-[#b042b4]/10 px-2 py-1 text-[11px] font-semibold text-[#b042b4]">
                          1 clic
                        </span>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: placeholder */}
          <Card className="p-6 flex items-center justify-center text-center min-h-[420px]">
            <div>
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-primary font-bold">IA</span>
              </div>
              <h3 className="text-lg font-bold mb-2">Prêt à générer ?</h3>
              <p className="text-sm text-muted-foreground">
                Choisis un type de contenu à gauche pour afficher l’interface de génération.
              </p>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Generator (on reste sur la logique produit: ContentGenerator centralise providers + save) */}
          <ContentGenerator type={selectedType} defaultPrompt={defaultPrompt} />
        </div>
      )}
    </div>
  )
}
