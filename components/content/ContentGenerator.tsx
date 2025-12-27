'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Props = {
  type: string
  /**
   * Pré-remplissage (server) basé sur profil business + plan.
   * Ne remplace jamais un texte déjà saisi par l’utilisateur.
   */
  defaultPrompt?: string
}

type Provider = 'openai' | 'claude' | 'gemini'

type GenerateResponse = {
  ok: boolean
  id?: string
  title?: string | null
  content?: string
  error?: string
  code?: string
  warning?: string
  saveError?: string
  usedUserKey?: boolean
}

type KeyStatusResp = {
  ok: boolean
  configured?: boolean
  hasKey?: boolean
  masked?: string | null
  error?: string
}

const PROVIDERS: Array<{ key: Provider; label: string; badge: string }> = [
  { key: 'openai', label: 'OpenAI', badge: 'Recommandé' },
  { key: 'claude', label: 'Claude', badge: 'Bientôt' },
  { key: 'gemini', label: 'Gemini', badge: 'Bientôt' },
]

const TYPE_META: Record<
  string,
  { label: string; defaultChannel: string; placeholder: string }
> = {
  post: {
    label: 'Post réseaux sociaux',
    defaultChannel: 'LinkedIn',
    placeholder:
      'Sujet + point de vue + structure (hook, valeur, CTA) + style…',
  },
  email: {
    label: 'Email marketing',
    defaultChannel: 'Email',
    placeholder:
      'Objectif + segment + promesse + structure (objet, intro, bullets, CTA)…',
  },
  blog: {
    label: 'Article de blog',
    defaultChannel: 'Blog',
    placeholder:
      'Sujet + mots-clés + structure voulue + niveau (débutant/avancé)…',
  },
  script: {
    label: 'Script vidéo',
    defaultChannel: 'YouTube',
    placeholder: 'Format (45s/60s) + style + hooks possibles + CTA…',
  },
  offer: {
    label: "Création d'offres",
    defaultChannel: 'Offre',
    placeholder:
      'Produit/offre + avatar + promesse + objections + preuves…',
  },
  funnel: {
    label: 'Funnel / Tunnel',
    defaultChannel: 'Funnel',
    placeholder:
      'Objectif funnel + lead magnet + séquence + étapes + messages clés…',
  },
  generic: {
    label: 'Contenu',
    defaultChannel: 'Content',
    placeholder: 'Décris ce que tu veux générer…',
  },
}

function safeParseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

function normalizeType(type: string) {
  const t = (type ?? '').trim().toLowerCase()
  if (t === 'video' || t === 'script-video' || t === 'script_video') return 'script'
  if (t === 'article' || t === 'blogpost') return 'blog'
  if (!t) return 'generic'
  if (TYPE_META[t]) return t
  return t
}

function isoDateOrNull(x: string | null) {
  const s = (x ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function normalizeTags(s: string) {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50)
}

export default function ContentGenerator({ type, defaultPrompt }: Props) {
  const normalizedType = useMemo(() => normalizeType(type), [type])
  const meta = useMemo(
    () => TYPE_META[normalizedType] ?? TYPE_META.generic,
    [normalizedType],
  )

  const [provider, setProvider] = useState<Provider>('openai')
  const [channel, setChannel] = useState<string>(meta.defaultChannel)
  const [scheduledDate, setScheduledDate] = useState<string>('')
  const [tags, setTags] = useState<string>('')

  const [prompt, setPrompt] = useState<string>(defaultPrompt ?? '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)

  const [keyStatus, setKeyStatus] = useState<KeyStatusResp | null>(null)

  useEffect(() => {
    setChannel(meta.defaultChannel)
    // On n’écrase pas un texte déjà saisi
    if (!(prompt ?? '').trim() && (defaultPrompt ?? '').trim()) {
      setPrompt(defaultPrompt ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.defaultChannel])

  useEffect(() => {
    let cancelled = false

    async function loadKeyStatus() {
      try {
        const res = await fetch(`/api/user/api-keys?provider=${provider}`, {
          method: 'GET',
        })
        const data = await safeParseJson<KeyStatusResp>(res)
        if (cancelled) return
        setKeyStatus(data)
      } catch (e) {
        if (cancelled) return
        setKeyStatus({
          ok: false,
          error: e instanceof Error ? e.message : 'Erreur',
        })
      }
    }

    loadKeyStatus()

    return () => {
      cancelled = true
    }
  }, [provider])

  const canGenerate = useMemo(() => {
    return !loading && (prompt ?? '').trim().length > 0
  }, [loading, prompt])

  const onGenerate = async () => {
    const safePrompt = (prompt ?? '').trim()
    const safeType = normalizeType(type)

    if (!safePrompt) {
      setResult({ ok: false, error: 'Le brief est requis.' })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: safeType,
          provider,
          channel: (channel ?? '').trim(),
          scheduledDate: isoDateOrNull(scheduledDate),
          tags: normalizeTags(tags),
          prompt: safePrompt,
        }),
      })

      const data = await safeParseJson<GenerateResponse>(res)

      if (!res.ok) {
        setResult({
          ok: false,
          code: (data as any)?.code ?? (res.status === 402 ? 'subscription_required' : undefined),
          error: data?.error ?? 'Erreur lors de la génération.',
        })
        return
      }

      setResult(data)
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : 'Erreur lors de la génération.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Provider */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Fournisseur IA</p>
            <p className="mt-1 text-sm text-slate-600">
              Tipote utilise ta clé si elle est configurée (sinon fallback propriétaire).
            </p>
          </div>

          <Link
            href="/settings?tab=ai"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
          >
            Gérer mes clés
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PROVIDERS.map((p) => {
            const active = p.key === provider
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setProvider(p.key)}
                className={
                  active
                    ? 'rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white'
                    : 'rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                }
              >
                <span className="inline-flex items-center gap-2">
                  {p.label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {p.badge}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">
            Clé OpenAI :{' '}
            <span className="font-medium">
              {keyStatus?.ok
                ? keyStatus.hasKey
                  ? keyStatus.masked ?? 'Configurée'
                  : 'Aucune (fallback Tipote)'
                : '…'}
            </span>
          </p>
        </div>
      </section>

      {/* Inputs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Type</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
              {meta.label}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Canal</p>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder={meta.defaultChannel}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Date (optionnel)</p>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Brief / Prompt</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={meta.placeholder}
              rows={6}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Tags (optionnel)</p>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ex: lancement, storytelling, preuve"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <p className="text-xs text-slate-500">Sépare par virgules.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className={[
              'rounded-xl px-4 py-2 text-xs font-semibold text-white',
              canGenerate ? 'bg-[#b042b4] hover:opacity-95' : 'bg-slate-300',
            ].join(' ')}
          >
            {loading ? 'Génération…' : 'Générer'}
          </button>

          <Link
            href="/contents"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
          >
            Voir mes contenus
          </Link>
        </div>

        {result ? (
          result.ok ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Résultat</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {result.title ?? 'Contenu généré'}
                  </p>
                  {result.warning ? (
                    <p className="text-xs text-amber-700">{result.warning}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {result.id ? (
                    <Link
                      href={`/contents/${result.id}`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      Ouvrir le détail
                    </Link>
                  ) : (
                    <Link
                      href="/contents"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      Ouvrir Content Hub
                    </Link>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <pre className="whitespace-pre-wrap text-sm text-slate-900">
                  {result.content ?? ''}
                </pre>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-800">Erreur</p>
              <p className="mt-1 text-sm text-rose-800">{result.error ?? 'Erreur inconnue'}</p>
              {result.code === 'subscription_required' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/settings?tab=billing"
                    className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
                  >
                    Voir les offres
                  </Link>
                  <Link
                    href="/settings?tab=ai"
                    className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50"
                  >
                    Gérer mes clés IA
                  </Link>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}
