// app/contents/[id]/page.tsx
// Détail d'un contenu + édition (server component)

import Link from 'next/link';
import { redirect } from 'next/navigation';

import AppShell from '@/components/AppShell';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { ContentEditor } from '@/components/content/ContentEditor';

type Props = {
  params: { id: string };
};

export default async function ContentDetailPage({ params }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/');

  const userEmail = session.user.email ?? '';
  const id = params.id;

  const { data: item, error } = await supabase
    .from('content_item')
    .select(
      'id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at'
    )
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    return (
      <AppShell userEmail={userEmail}>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">Erreur</p>
          <p className="mt-1 text-sm text-rose-800">{error.message}</p>
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell userEmail={userEmail}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Contenu introuvable</p>
            <p className="mt-1 text-sm text-slate-500">
              Soit il a été supprimé, soit vous n&apos;y avez pas accès.
            </p>
            <Link
              href="/contents"
              className="mt-4 inline-flex rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              ← Retour à Mes contenus
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Mes contenus</p>
            <h1 className="mt-1 text-xl md:text-2xl font-semibold text-slate-900 truncate">
              {item.title ?? 'Sans titre'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Type: {item.type ?? '—'} • Canal: {item.channel ?? '—'}
            </p>
          </div>

          <Link
            href="/contents"
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
          >
            ← Retour
          </Link>
        </div>

        <ContentEditor initialItem={item} />
      </div>
    </AppShell>
  );
}
