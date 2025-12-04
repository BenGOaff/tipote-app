// components/BlocksClient.tsx
// Rôle : composant client pour gérer l'affichage et la création des business blocks.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export type BusinessBlock = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

type BlocksClientProps = {
  initialBlocks: BusinessBlock[];
};

export default function BlocksClient({ initialBlocks }: BlocksClientProps) {
  const router = useRouter();

  const [blocks] = useState<BusinessBlock[]>(initialBlocks);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idea' | 'in_progress' | 'done'>('idea');
  const [priority, setPriority] = useState(3);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!title.trim()) {
      setErrorMsg('Merci de donner un titre à ton block.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/blocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorMsg(
          data?.error ??
            'Impossible de créer le block. Merci de réessayer.',
        );
        setLoading(false);
        return;
      }

      setTitle('');
      setDescription('');
      setStatus('idea');
      setPriority(3);
      setSuccessMsg('Block créé avec succès.');

      // Recharger les données serveur (liste mise à jour)
      router.refresh();
    } catch (err) {
      console.error('[BlocksClient] unexpected error', err);
      setErrorMsg('Erreur inattendue. Merci de réessayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Formulaire de création */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">
            Créer un block business
          </h2>
          <p className="text-sm text-slate-500">
            Un block représente un bloc stratégique de ton business (offre,
            funnel, audience, contenu, etc.).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-900">
              Titre du block
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#b042b4] focus:ring-1 focus:ring-[#b042b4]/60"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Offre principale, Funnel Evergreen, Audience Instagram..."
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-900">
              Description
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#b042b4] focus:ring-1 focus:ring-[#b042b4]/60"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Quelques détails sur ce block, son objectif, son contexte..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Statut
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#b042b4] focus:ring-1 focus:ring-[#b042b4]/60"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'idea' | 'in_progress' | 'done')
                }
              >
                <option value="idea">Idée / à cadrer</option>
                <option value="in_progress">En cours</option>
                <option value="done">Stabilisé</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Priorité
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#b042b4] focus:ring-1 focus:ring-[#b042b4]/60"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              >
                <option value={1}>1 — Très prioritaire</option>
                <option value={2}>2</option>
                <option value={3}>3 — Normal</option>
                <option value={4}>4</option>
                <option value={5}>5 — À long terme</option>
              </select>
            </div>
          </div>

          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errorMsg}
            </p>
          )}
          {successMsg && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {successMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-[#b042b4] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#a03ca6] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Création...' : 'Créer le block'}
          </button>
        </form>
      </section>

      {/* Liste des blocks */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Mes blocks business
        </h2>

        {blocks.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun block pour l&apos;instant. Commence par en créer un ci-dessus.
          </p>
        ) : (
          <div className="space-y-2">
            {blocks.map((block) => (
              <article
                key={block.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/app/blocks/${block.id}`}
                    className="text-sm font-semibold text-slate-900 hover:text-[#b042b4]"
                  >
                    {block.title}
                  </Link>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-600">
                    {block.status === 'idea'
                      ? 'Idée'
                      : block.status === 'in_progress'
                      ? 'En cours'
                      : 'Stabilisé'}
                  </span>
                </div>
                {block.description && (
                  <p className="text-xs text-slate-600 mt-1">
                    {block.description}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  Priorité : {block.priority} • Créé le{' '}
                  {new Date(block.created_at).toLocaleDateString('fr-FR')}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
