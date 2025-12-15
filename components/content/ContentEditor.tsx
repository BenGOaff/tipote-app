'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  initialItem: ContentItem;
};

type ApiResponse =
  | { ok: true; item: ContentItem }
  | { ok: false; error: string }
  | { ok: true; warning?: string; saveError?: string; title?: string; content?: string };

function normalizeTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const [, y, mm, dd] = m;
  return `${dd}/${mm}/${y}`;
}

export function ContentEditor({ initialItem }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initialItem.title ?? '');
  const [channel, setChannel] = useState(initialItem.channel ?? '');
  const [scheduledDate, setScheduledDate] = useState(initialItem.scheduled_date ?? '');
  const [status, setStatus] = useState(initialItem.status ?? 'draft');
  const [tags, setTags] = useState((initialItem.tags ?? []).join(', '));
  const [content, setContent] = useState(initialItem.content ?? '');
  const [prompt, setPrompt] = useState(initialItem.prompt ?? '');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty = useMemo(() => {
    const a = initialItem;
    return (
      (a.title ?? '') !== title ||
      (a.channel ?? '') !== channel ||
      (a.scheduled_date ?? '') !== scheduledDate ||
      (a.status ?? '') !== status ||
      (a.content ?? '') !== content ||
      (a.prompt ?? '') !== prompt ||
      (a.tags ?? []).join(', ') !== tags
    );
  }, [initialItem, title, channel, scheduledDate, status, tags, content, prompt]);

  async function savePatch(next?: Partial<{ status: string }>) {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/content/${initialItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          channel,
          scheduledDate: scheduledDate || null,
          status: next?.status ?? status,
          tags: normalizeTags(tags),
          content,
          prompt,
        }),
      });

      const data = (await res.json()) as ApiResponse;

      if (!('ok' in data) || !data.ok) {
        setMessage({ kind: 'err', text: data.error ?? 'Erreur' });
        return;
      }

      if ('item' in data && data.item) {
        setStatus(data.item.status ?? status);
        setMessage({ kind: 'ok', text: 'Enregistré ✅' });
        router.refresh();
        return;
      }

      setMessage({ kind: 'ok', text: 'Enregistré ✅' });
      router.refresh();
    } catch (e) {
      setMessage({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Erreur inconnue',
      });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const ok = window.confirm('Supprimer ce contenu ? (action irréversible)');
    if (!ok) return;

    setDeleting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/content/${initialItem.id}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        setMessage({ kind: 'err', text: data.error ?? 'Erreur' });
        return;
      }

      router.push('/contents');
      router.refresh();
    } catch (e) {
      setMessage({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Erreur inconnue',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              Statut : <span className="font-semibold text-slate-900">{status}</span>
              {scheduledDate ? (
                <>
                  {' '}
                  • Planifié :{' '}
                  <span className="font-semibold text-slate-900">{formatDate(scheduledDate)}</span>
                </>
              ) : null}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">Édition</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => savePatch()}
              disabled={saving || !dirty}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-[#b042b4] px-4 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            <button
              type="button"
              onClick={() => savePatch({ status: 'published' })}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              Marquer publié
            </button>

            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </div>

        {message ? (
          <div
            className={[
              'mt-4 rounded-xl border p-3 text-sm',
              message.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800',
            ].join(' ')}
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Titre</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="Titre"
            />
          </div>

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
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Statut</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
            >
              <option value="draft">draft</option>
              <option value="planned">planned</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </div>

          <div className="lg:col-span-2 grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="Ex: acquisition, offre, mindset"
            />
          </div>

          <div className="lg:col-span-2 grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Consigne (prompt)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="Brief utilisé pour générer"
            />
          </div>

          <div className="lg:col-span-2 grid gap-2">
            <label className="text-xs font-semibold text-slate-700">Contenu</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[320px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b042b4]/30"
              placeholder="Contenu généré"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
