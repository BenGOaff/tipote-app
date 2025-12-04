// components/BlockDetailClient.tsx
// Rôle : édition/suppression d'un block individuel côté client.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessBlock } from '@/components/BlocksClient';

type Props = {
  block: BusinessBlock;
};

export default function BlockDetailClient({ block }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(block.title);
  const [description, setDescription] = useState(block.description ?? '');
  const [status, setStatus] = useState<'idea' | 'in_progress' | 'done'>(
    (block.status as 'idea' | 'in_progress' | 'done') ?? 'idea',
  );
  const [priority, setPriority] = useState(block.priority);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!title.trim()) {
      setErrorMsg('Le titre ne peut pas être vide.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: 'PATCH',
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
          data?.error ?? 'Impossible de mettre à jour le block.',
        );
        setSaving(false);
        return;
      }

      setSuccessMsg('Block mis à jour.');
      router.refresh();
    } catch (err) {
      console.error('[BlockDetailClient] unexpected error', err);
      setErrorMsg('Erreur inattendue. Merci de réessayer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce block ? Cette action est définitive.')) {
      return;
    }

    setDeleting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorMsg(
          data?.error ?? 'Impossible de supprimer le block.',
        );
        setDeleting(false);
        return;
      }

      router.push('/app/blocks');
      router.refresh();
    } catch (err) {
      console.error('[BlockDetailClient] delete error', err);
      setErrorMsg('Erreur inattendue. Merci de réessayer.');
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-900">
          Titre du block
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#b042b4] focus:ring-1 focus:ring-[#b042b4]/60"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          rows={4}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-[#b042b4] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#a03ca6] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {deleting ? 'Suppression...' : 'Supprimer le block'}
        </button>
      </div>
    </form>
  );
}
