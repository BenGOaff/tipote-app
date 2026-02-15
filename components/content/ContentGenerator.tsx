'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { emitCreditsUpdated } from '@/lib/credits/client'
import { useCreditsBalance } from '@/lib/credits/useCreditsBalance'

type Props = {
  type: string
  /**
   * Pré-remplissage (server) basé sur profil business + plan.
   * Ne remplace jamais un texte déjà saisi par l'utilisateur.
   */
  defaultPrompt?: string
}

type GenerateResponse = {
  ok: boolean
  id?: string
  title?: string | null
  content?: string
  error?: string
  code?: string
  warning?: string
  saveError?: string
}

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
        'Sujet, angle, cible, mots-clés (si tu en as), longueur…\nEx: "Comment trouver ses 10 premiers clients en B2B", ton pédagogique, plan H2/H3.',
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
    subtitle: 'LinkedIn, Threads, Facebook, X…',
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

  // Pré-remplissage safe : uniquement si l'utilisateur n'a rien saisi
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
        }),
      })

      const data = (await res.json().catch(() => null)) as GenerateResponse | null

      if (!data) {
        setResult({ ok: false, error: 'Réponse invalide.' })
        return
      }

      if (!res.ok || !data.ok) {
        const code = data?.code ?? (res.status === 402 ? 'NO_CREDITS' : undefined)

        setResult({
          ok: false,
          error: data?.error ?? 'Erreur lors de la génération.',
          code,
        })

        return
      }

      setResult(data)

      // Refresh crédits partout (sidebar/billing/settings) après une génération réussie
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
        setBillingSyncMsg(json?.error ? String(json.error) : "Impossible de vérifier l'abonnement.")
        return
      }

      setBillingSyncMsg('Abonnement mis à jour. Tu peux réessayer.')
      router.refresh()
    } catch (e) {
      setBillingSyncMsg(e instanceof Error ? e.message : "Impossible de vérifier l'abonnement.")
    } finally {
      setBillingSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Crédits */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-900">Crédits IA</p>
            <Link href="/settings?tab=billing" className="text-xs font-semibold text-[#b042b4] hover:underline">
              Gérer mes crédits
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            1 génération = 1 crédit
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
                  <p className="text-sm font-semibold text-slate-900">Contenu généré</p>
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

              {result.code === 'NO_CREDITS' ? (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/settings?tab=billing"
                      className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
                    >
                      Recharger mes crédits
                    </Link>
                    <button
                      type="button"
                      onClick={onSyncBilling}
                      disabled={billingSyncing}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {billingSyncing ? 'Vérification…' : "J'ai déjà payé"}
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