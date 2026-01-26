'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ampTrack } from '@/lib/telemetry/amplitude-client'
import { emitCreditsUpdated } from '@/lib/credits/client'
import { useCreditsBalance } from '@/lib/credits/useCreditsBalance'

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

const PROVIDERS: Array<{ key: Provider; label: string; badge: string }> = [
  { key: 'openai', label: 'OpenAI', badge: 'Recommandé' },
  { key: 'claude', label: 'Claude', badge: 'Bientôt' },
  { key: 'gemini', label: 'Gemini', badge: 'Bientôt' },
]

function normalizeType(t: string) {
  const s = (t ?? '').trim().toLowerCase()
  if (!s) return 'post'
  return s
}

function metaForType(type: string) {
  const t = normalizeType(type)

  if (t === 'email') {
    return {
      title: 'Email',
      subtitle: 'Un email clair, orienté conversion',
      placeholder:
        "Objectif de l'email, contexte, offre, cible, ton…\nEx: email de relance après découverte, ton direct, CTA prise de call.",
      defaultChannel: 'Email',
      defaultTags: ['email', 'conversion'],
    }
  }

  if (t === 'blog') {
    return {
      title: 'Article de blog',
      subtitle: 'Structuré, lisible, SEO-friendly',
      placeholder:
        'Sujet, angle, cible, mots-clés (si tu en as), longueur…\nEx: “Comment trouver ses 10 premiers clients en B2B”, ton pédagogique, plan H2/H3.',
      defaultChannel: 'Blog',
      defaultTags: ['blog', 'seo'],
    }
  }

  if (t === 'script') {
    return {
      title: 'Script vidéo',
      subtitle: "'Hook + structure + CTA'",
      placeholder:
        'Sujet, format (Reel/TikTok/YouTube), durée, cible, ton…\nEx: 45s, hook fort, 3 points, CTA vers lead magnet.',
      defaultChannel: 'Vidéo',
      defaultTags: ['video', 'script'],
    }
  }

  return {
    title: 'Post réseaux sociaux',
    subtitle: 'LinkedIn, Instagram, X…',
    placeholder:
      'Sujet, angle, cible, objectif, style…\nEx: post LinkedIn storytelling, 180–240 mots, ton direct, 1 CTA.',
    defaultChannel: 'LinkedIn',
    defaultTags: ['social', 'post'],
  }
}

export function ContentGenerator({ type, defaultPrompt }: Props) {
  const router = useRouter()
  const { refresh: refreshCredits } = useCreditsBalance({ auto: false })

  const meta = useMemo(() => metaForType(type), [type])

  const [provider, setProvider] = useState<Provider>('openai')

  const [channel, setChannel] = useState<string>(meta.defaultChannel)
  const [tags, setTags] = useState<string>(() => (meta.defaultTags ?? []).join(', '))

  const [prompt, setPrompt] = useState<string>(() => (defaultPrompt ?? '').trim() || '')
  const [didPrefill, setDidPrefill] = useState<boolean>(() => !!(defaultPrompt ?? '').trim())

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [billingSyncing, setBillingSyncing] = useState(false)
  const [billingSyncMsg, setBillingSyncMsg] = useState<string | null>(null)

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

  const canGenerate = useMemo(() => {
    return !loading && (prompt ?? '').trim().length > 0
  }, [loading, prompt])

  const onGenerate = async () => {
    setBillingSyncMsg(null)

    const safePrompt = (prompt ?? '').trim()
    const safeType = normalizeType(type)

    if (!safePrompt) {
      setResult({ ok: false, error: 'Le brief est requis.' })
      return
    }

    setLoading(true)
    setResult(null)

    // ✅ event: tentative de génération (utile pour mesurer l’usage même si ça échoue)
    ampTrack('tipote_content_generate_clicked', {
      type: safeType,
      provider,
      channel: (channel ?? '').trim() || null,
      tags_count: (tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean).length,
      prompt_len: safePrompt.length,
    })

    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: safeType,
          channel: (channel ?? '').trim() || null,
          tags: (tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 50),
          prompt: safePrompt,
          // ✅ On garde le champ pour compat backend / futur multi-modèles
          // mais on ne dépend plus de clés API user : tout passe via la clé owner + crédits.
          provider,
        }),
      })

      const data = (await res.json().catch(() => null)) as GenerateResponse | null

      if (!data) {
        setResult({ ok: false, error: 'Réponse invalide.' })
        ampTrack('tipote_content_generate_failed', {
          type: safeType,
          provider,
          code: 'invalid_response',
        })
        return
      }

      if (!res.ok || !data.ok) {
        const code = data?.code ?? (res.status === 402 ? 'subscription_required' : undefined)

        setResult({
          ok: false,
          error: data?.error ?? 'Erreur lors de la génération.',
          code,
        })

        ampTrack('tipote_content_generate_failed', {
          type: safeType,
          provider,
          code: code ?? `http_${res.status}`,
          usedUserKey: Boolean(data?.usedUserKey),
        })
        return
      }

      setResult(data)

      // ✅ event: contenu généré (ton KPI “premiers contenus générés”)
      ampTrack('tipote_content_generated', {
        type: safeType,
        provider,
        content_id: data.id ?? null,
        title_present: Boolean(data.title),
        warning_present: Boolean(data.warning),
        save_error_present: Boolean(data.saveError),
        usedUserKey: Boolean(data.usedUserKey),
      })

      // ✅ Refresh crédits partout (sidebar/billing/settings) après une génération réussie
      emitCreditsUpdated()
      try {
        await refreshCredits()
      } catch {
        // noop
      }
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : 'Erreur lors de la génération.',
      })

      ampTrack('tipote_content_generate_failed', {
        type: normalizeType(type),
        provider,
        code: 'exception',
      })
    } finally {
      setLoading(false)
    }
  }

  const onSyncBilling = async () => {
    setBillingSyncMsg(null)
    setBillingSyncing(true)
    try {
      const res = await fetch('/api/billing/sync', { method: 'POST' })
      const json = (await res.json().catch(() => null)) as any

      if (!res.ok || !json?.ok) {
        setBillingSyncMsg(json?.error ? String(json.error) : "Impossible de vérifier l’abonnement.")
        return
      }

      setBillingSyncMsg('Abonnement mis à jour ✅ Tu peux réessayer.')
      router.refresh()
    } catch (e) {
      setBillingSyncMsg(e instanceof Error ? e.message : "Impossible de vérifier l’abonnement.")
    } finally {
      setBillingSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Provider */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">Modèle IA</h3>
            <p className="text-xs text-slate-600">Choisis le modèle qui génère ton contenu.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => {
              const active = p.key === provider
              const disabled = p.key !== 'openai'
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setProvider(p.key)}
                  disabled={disabled}
                  className={[
                    'rounded-xl border px-3 py-2 text-left text-xs font-semibold',
                    active
                      ? 'border-[#b042b4] bg-[#b042b4]/5 text-[#7a2d7e]'
                      : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
                    disabled ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{p.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {p.badge}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ✅ Fin des clés API user : le système repose sur les crédits Tipote */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-900">Crédits IA Tipote</p>
            <Link href="/settings?tab=billing" className="text-xs font-semibold text-[#b042b4] hover:underline">
              Gérer mes crédits
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            La génération utilise les crédits Tipote (plus de clé API personnelle requise).
          </p>
        </div>
      </section>

      {/* Prompt */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">{meta.title}</h3>
            <p className="text-xs text-slate-600">{meta.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Canal</span>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="h-10 w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="LinkedIn, Email…"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="ex: lancement, preuve sociale"
            />
            <p className="text-[11px] text-slate-500">Sépare par des virgules.</p>
          </div>

          <div className="md:col-span-2 grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Brief</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[180px] rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder={meta.placeholder}
            />
            <p className="text-[11px] text-slate-500">
              Astuce: sois précis (cible, objectif, ton, contraintes). Tu peux coller un exemple à imiter.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
                  <p className="text-sm font-semibold text-slate-900">Contenu généré ✅</p>
                  {result.title ? <p className="text-xs text-slate-600">{result.title}</p> : null}
                  {result.warning ? <p className="text-xs font-semibold text-amber-700">{result.warning}</p> : null}
                  {result.saveError ? <p className="text-xs font-semibold text-rose-700">{result.saveError}</p> : null}
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
                <pre className="whitespace-pre-wrap text-sm text-slate-900">{result.content ?? ''}</pre>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-800">Erreur</p>
              <p className="mt-1 text-sm text-rose-800">{result.error ?? 'Erreur inconnue'}</p>

              {result.code === 'subscription_required' ? (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/settings?tab=billing"
                      className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
                    >
                      Voir les offres
                    </Link>
                    <button
                      type="button"
                      onClick={onSyncBilling}
                      disabled={billingSyncing}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {billingSyncing ? 'Vérification…' : 'J’ai déjà payé'}
                    </button>
                  </div>

                  {billingSyncMsg ? <p className="mt-2 text-xs font-medium text-rose-800">{billingSyncMsg}</p> : null}
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}

export default ContentGenerator
