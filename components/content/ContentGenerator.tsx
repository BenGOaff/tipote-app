"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Props = {
  type: string;
};

type GenerateResponse = {
  ok: boolean;
  id?: string;
  title?: string;
  content?: string;
  error?: string;
};

const TYPE_PRESETS: Record<
  string,
  { label: string; defaultChannel: string; placeholder: string }
> = {
  post: {
    label: "Post",
    defaultChannel: "LinkedIn",
    placeholder: "Sujet + angle + audience + ton (ex: direct, bienveillant) + CTA…",
  },
  email: {
    label: "Email",
    defaultChannel: "Email",
    placeholder:
      "Objectif (nurture/vente) + contexte + offre éventuelle + ton + longueur…",
  },
  blog: {
    label: "Blog",
    defaultChannel: "Blog",
    placeholder: "Sujet + mots-clés + structure voulue + niveau (débutant/avancé)…",
  },
  video_script: {
    label: "Script vidéo",
    defaultChannel: "YouTube/Shorts",
    placeholder: "Format (45s/60s) + style + hooks possibles + CTA…",
  },
  sales_page: {
    label: "Page de vente",
    defaultChannel: "Landing",
    placeholder: "Produit/offre + avatar + promesse + objections + preuves…",
  },
  funnel: {
    label: "Funnel",
    defaultChannel: "Funnel",
    placeholder: "Objectif + offre + étapes attendues + canaux + timing…",
  },
};

function isoDateOrNull(v: string): string | null {
  if (!v) return null;
  // input[type=date] returns YYYY-MM-DD (already OK)
  return v;
}

export function ContentGenerator({ type }: Props) {
  const preset = useMemo(
    () =>
      TYPE_PRESETS[type] ?? {
        label: "Contenu",
        defaultChannel: "Général",
        placeholder: "Décris précisément ce que tu veux produire…",
      },
    [type],
  );

  const [channel, setChannel] = useState(preset.defaultChannel);
  const [scheduledDate, setScheduledDate] = useState("");
  const [tags, setTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<GenerateResponse | null>(null);

  async function onGenerate() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          channel,
          scheduledDate: isoDateOrNull(scheduledDate),
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          prompt,
        }),
      });

      const data = (await res.json()) as GenerateResponse;
      setResult(data);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "Erreur inconnue",
      });
    } finally {
      setLoading(false);
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
            <label className="text-xs font-semibold text-slate-700">
              Consigne / angle
            </label>
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
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#b042b4] px-4 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {loading ? "Génération…" : `Générer + sauvegarder`}
          </button>

          <div className="flex items-center justify-between">
            <Link className="text-xs font-semibold text-slate-700 hover:underline" href="/contents">
              Voir mes contenus →
            </Link>
            <span className="text-[11px] text-slate-500">Type: {preset.label}</span>
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
          {result?.ok && result.id ? (
            <span className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 border border-emerald-100">
              Sauvegardé
            </span>
          ) : null}
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
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700">Titre</p>
              <p className="mt-1 text-sm text-slate-900">{result.title ?? "—"}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700">Contenu</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-900 leading-relaxed">
                {result.content ?? ""}
              </pre>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{result.error ?? "Erreur inconnue"}</p>
          </div>
        )}
      </section>
    </div>
  );
}
