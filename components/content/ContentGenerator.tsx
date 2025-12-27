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
    label: 'Email',
    defaultChannel: 'Newsletter',
    placeholder:
      'Objectif + segment + promesse + structure (objet, intro, bullets, CTA)…',
  },
  blog: {
    label: 'Blog',
    defaultChannel: 'Blog',
    placeholder:
      'Sujet + mots-clés + structure voulue + niveau (débutant/avancé)…',
  },
  video_script: {
    label: 'Script vidéo',
    defaultChannel: 'YouTube/Shorts',
    placeholder: 'Format (45s/60s) + style + hooks possibles + CTA…',
  },
  sales_page: {
    label: 'Page de vente',
    defaultChannel: 'Landing',
    placeholder:
      'Produit/offre + avatar + promesse + objections + preuves…',
  },
  funnel: {
    label: 'Funnel / Tunnel',
    defaultChannel: 'Funnel',
    placeholder:
      'Objectif funnel + lead magnet + séquence + étapes + messages clés…',
  },
}

function safeParseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

function normalizeType(type: string) {
  const t = (type ?? '').trim().toLowerCase()
  if (t === 'video' || t === 'script') return 'video_script'
  if (t === 'sales' || t === 'landing') return 'sales_page'
  return t
}

function normalizeTags(tagsCsv: string) {
  const s = (tagsCsv ?? '').trim()
  if (!s) return []
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function isoDateOrNull(date: string) {
  const s = (date ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export function ContentGenerator({ type, defaultPrompt }: Props) {
  const meta = useMemo(() => {
    const safeType = normalizeType(type)
    return TYPE_META[safeType] ?? {
      label: 'Contenu',
      defaultChannel: 'Général',
      placeholder: 'Décris ce que tu veux générer…',
    }
  }, [type])

  const [provider, setProvider] = useState<Provider>('openai')
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null)
  const [providerMasked, setProviderMasked] = useState<string | null>(null)

  const [channel, setChannel] = useState(meta.defaultChannel)
  const [scheduledDate, setScheduledDate] = useState('')
  const [tags, setTags] = useState('')

  const [prompt, setPrompt] = useState(() => (defaultPrompt ?? '').trim())
  const [didPrefill, setDidPrefill] = useState<boolean>(() => !!(defaultPrompt ?? '').trim())

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)

  useEffect(() => {
    setChannel(meta.defaultChannel)
  }, [meta.defaultChannel])

  // ✅ Pré-remplissage safe : uniquement si l’utilisateur n’a rien saisi
  useEffect(() => {
    const p = (defaultPrompt ?? '').trim()
    if (!p) return
    if (didPrefill) return
    if ((prompt ?? '').trim()) return
    setPrompt(p)
    setDidPrefill(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPrompt, didPrefill])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setProviderConfigured(null)
      setProviderMasked(null)

      try {
        const res = await fetch(`/api/user/api-keys?provider=${provider}`, {
          method: 'GET',
        })
        const json = (await res.json().catch(() => null)) as KeyStatusResp | null
        if (cancelled) return

        if (!res.ok || !json?.ok) {
          setProviderConfigured(false)
          setProviderMasked(null)
          return
        }

        const ok = !!json.configured || !!json.hasKey
        setProviderConfigured(ok)
        setProviderMasked(json.masked ?? null)
      } catch {
        if (cancelled) return
        setProviderConfigured(false)
        setProviderMasked(null)
      }
    }

    void run()
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
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">Modèle IA</h3>
            <p className="text-xs text-slate-500">
              Choisis le provider. (Claude/Gemini : UI prête, backend à activer).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
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
                  {p.label}
                  <span className="ml-2 text-[10px] opacity-80">{p.badge}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-600">
            Clé {provider.toUpperCase()} :{' '}
            {providerConfigured == null ? (
              <span className="font-medium">…</span>
            ) : providerConfigured ? (
              <span className="font-mono font-medium text-slate-900">
                {providerMasked ?? 'Configurée'}
              </span>
            ) : (
              <span className="font-medium text-slate-900">
                non configurée (fallback possible)
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Gérer tes clés :{' '}
            <Link href="/settings?tab=ai" className="font-semibold text-[#b042b4]">
              Paramètres → IA & API
            </Link>
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500">Type</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">{meta.label}</h3>
          </div>

          <Link
            href="/contents"
            className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
          >
            Mes contenus
          </Link>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Canal</label>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="Ex: LinkedIn"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Date planifiée</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
            />
            <p className="text-[11px] text-slate-500">
              Optionnel — si renseigné, le contenu est marqué “planifié”.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">
              Tags (séparés par des virgules)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="Ex: lancement, offre, copywriting"
            />
            <p className="text-[11px] text-slate-500">Optionnel — max 12 tags.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-xs font-semibold text-slate-700">Brief</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
            placeholder={meta.placeholder}
          />
          <p className="text-[11px] text-slate-500">
            Plus tu es précis (cible, promesse, objections, CTA), meilleur sera le résultat.
          </p>
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
                  {result.usedUserKey != null ? (
                    <p className="text-[11px] text-slate-500">
                      {result.usedUserKey
                        ? 'Clé utilisateur utilisée ✅'
                        : 'Fallback (clé propriétaire) ⚠️'}
                    </p>
                  ) : null}
                  {result.warning ? (
                    <p className="text-[11px] text-amber-700">{result.warning}</p>
                  ) : null}
                  {result.saveError ? (
                    <p className="text-[11px] text-rose-700">{result.saveError}</p>
                  ) : null}
                </div>

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
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}
