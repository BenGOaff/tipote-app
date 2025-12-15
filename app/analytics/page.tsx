// app/analytics/page.tsx
// Analytics : KPIs basés sur content_item (sans nouvelle table)
// - Protégé auth Supabase
// - Ne casse pas onboarding / login / magic link

import Link from 'next/link';
import { redirect } from 'next/navigation';

import AppShell from '@/components/AppShell';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type ContentRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  channel: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number) {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - n);
  return startOfDay(d);
}

function isPublished(status: string | null | undefined) {
  return String(status ?? '').toLowerCase() === 'published';
}
function isPlanned(status: string | null | undefined) {
  const s = String(status ?? '').toLowerCase();
  return s === 'planned';
}
function isDraft(status: string | null | undefined) {
  const s = String(status ?? '').toLowerCase();
  return s === 'draft' || !s;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const [, y, mm, dd] = m;
  return `${dd}/${mm}/${y}`;
}

export default async function AnalyticsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/');

  const userEmail = session.user.email ?? '';

  // On prend un échantillon raisonnable (les 500 derniers) pour calculer des KPIs rapides
  const { data, error } = await supabase
    .from('content_item')
    .select('id, title, type, status, channel, scheduled_date, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows: ContentRow[] = Array.isArray(data) ? (data as ContentRow[]) : [];

  const total = rows.length;
  const published = rows.filter((r) => isPublished(r.status)).length;
  const planned = rows.filter((r) => isPlanned(r.status) || Boolean(r.scheduled_date)).length;
  const drafts = rows.filter((r) => isDraft(r.status) && !r.scheduled_date).length;

  const since7 = daysAgo(7).getTime();
  const since30 = daysAgo(30).getTime();

  const published7 = rows.filter((r) => {
    if (!isPublished(r.status)) return false;
    const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
    return ts >= since7;
  }).length;

  const published30 = rows.filter((r) => {
    if (!isPublished(r.status)) return false;
    const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
    return ts >= since30;
  }).length;

  const last10 = rows.slice(0, 10);

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Analytics</h1>
            <p className="mt-1 text-sm text-slate-500">
              Vue rapide basée sur vos contenus (brouillons, planifiés, publiés).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/contents"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              Mes contenus
            </Link>
            <Link
              href="/create"
              className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              + Créer
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{error.message}</p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total contenus', value: total },
            { label: 'Brouillons', value: drafts },
            { label: 'Planifiés', value: planned },
            { label: 'Publiés', value: published },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{s.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Rythme</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Publiés sur 7 jours</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{published7}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Publiés sur 30 jours</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{published30}</p>
              </div>
              <p className="text-xs text-slate-500">
                (Prochaine étape : brancher des “entries” d’engagement & chiffres de vente.)
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-slate-900">Derniers contenus</h2>
              <span className="text-xs text-slate-500">Top 10</span>
            </div>

            {last10.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <p className="text-sm text-slate-600">Aucun contenu pour le moment.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Crée ton premier contenu pour alimenter les analytics.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {last10.map((r) => (
                  <Link
                    key={r.id}
                    href={`/contents/${r.id}`}
                    className="block p-4 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500">
                          {r.type ?? '—'} • {r.channel ?? '—'}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
                          {r.title ?? 'Sans titre'}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Statut: <span className="font-semibold text-slate-700">{r.status ?? '—'}</span>
                          {' • '}
                          Planifié: <span className="font-semibold text-slate-700">{formatDate(r.scheduled_date)}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-[#b042b4]">Ouvrir →</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
