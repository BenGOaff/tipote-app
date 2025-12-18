'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type Props = {
  type: string
}

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

type Preset = {
  label: string
  defaultChannel: string
  placeholder: string
}

const TYPE_PRESETS: Record<string, Preset> = {
  post: {
    label: 'Post',
    defaultChannel: 'LinkedIn',
    placeholder: 'Sujet + angle + audience + ton (ex: direct, bienveillant) + CTA…',
  },
  email: {
    label: 'Email',
    defaultChannel: 'Email',
    placeholder: 'Objectif (nurture/vente) + contexte + offre éventuelle + ton + longueur…',
  },
  blog: {
    label: 'Blog',
    defaultChannel: 'Blog',
    placeholder: 'Sujet + mots-clés + structure voulue + niveau (débutant/avancé)…',
  },
  video_script: {
    label: 'Script vidéo',
    defaultChannel: 'YouTube/Shorts',
    placeholder: 'Format (45s/60s) + style + hooks possibles + CTA…',
  },
  sales_page: {
    label: 'Page de vente',
    defaultChannel: 'Landing',
    placeholder: 'Produit/offre + avatar + promesse + objections + preuves…',
  },
  funnel: {
    label: 'Funnel',
    defaultChannel: 'Funnel',
    placeholder: 'Objectif + offre + étapes attendues + canaux + timing…',
  },
}

function isoDateOrNull(v: string): string | null {
  const value = (v ?? '').trim()
  return value ? value : null
}

function normalizeType(t: string): string {
  const raw = (t ?? '').trim()
  if (!raw) return 'post'
  if (raw === 'video') return 'video_script'
  return raw
}

function normalizeTags(tags: string): string[] {
  return (tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

async function safeParseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function ContentGenerator({ type }: Props) {
  const normalizedType = useMemo(() => normalizeType(type), [type])

  const preset = useMemo(() => {
    return (
      TYPE_PRESETS[normalizedType] ?? {
        label: 'Contenu',
        defaultChannel: 'Général',
        placeholder: 'Décris précisément ce que tu veux produire…',
      }
    )
  }, [normalizedType])

  const [channel, setChannel] = useState(preset.defaultChannel)
  const [scheduledDate, setScheduledDate] = useState('')
  const [tags, setTags] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)

  async function onGenerate() {
    if (loading) return

    const safePrompt = prompt.trim()
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
          error:
            data?.error ||
            `Erreur API (${res.status})${res.statusText ? `: ${res.statusText}` : ''}`,
          warning: data?.warning,
          saveError: data?.saveError,
        })
        return
      }

      setResult(
        data ?? {
          ok: false,
          error: 'Réponse API invalide',
        }
      )
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : 'Erreur inconnue',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Brief</h2>
        <p className="mt-1 text-xs text-slate-500">
          Plus tu es précis (objectif, audience, ton, contraintes), mieux c’est.
        </p>

        <div className="mt-4 space-y-4">
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
              placeholder="Ex: acquisition, offre, mindset"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Consigne / angle</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder={preset.placeholder}
            />
          </div>

          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || !prompt.trim()}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#b042b4] px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {loading ? 'Génération…' : 'Générer + sauvegarder'}
          </button>

          <div className="flex items-center justify-between">
            <Link href="/contents" className="text-xs font-semibold text-slate-700 hover:underline">
              Voir mes contenus →
            </Link>
            <div className="text-[11px] text-slate-500">
              Type: <span className="font-semibold text-slate-700">{preset.label}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Résultat</h2>
            <p className="mt-1 text-xs text-slate-500">
              Le contenu est sauvegardé automatiquement dans “Mes contenus”.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {result?.usedUserKey ? (
              <span className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                Clé utilisateur ✅
              </span>
            ) : null}

            {result?.ok && result.id ? (
              <Link
                href={`/contents/${result.id}`}
                className="shrink-0 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Ouvrir →
              </Link>
            ) : null}
          </div>
        </div>

        {!result ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-600">Lance une génération pour voir le contenu ici.</p>
            <p className="mt-1 text-xs text-slate-500">
              (On branchera ensuite la sélection de provider + clés chiffrées.)
            </p>
          </div>
        ) : result.ok ? (
          <div className="mt-4 space-y-3">
            {result.warning ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {result.warning}
                {result.saveError ? <div className="mt-1 text-xs">{result.saveError}</div> : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700">Titre</p>
              <p className="mt-1 text-sm text-slate-900">{result.title ?? '—'}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700">Contenu</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                {result.content ?? ''}
              </pre>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{result.error ?? 'Erreur inconnue'}</p>
          </div>
        )}
      </section>
    </div>
  )
}
