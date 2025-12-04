// app/app/blocks/[id]/page.tsx
// Rôle : page détail d'un block business.

import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';
// IMPORTS EN RELATIF POUR ÉVITER LE PROBLÈME D'ALIAS
import BlockDetailClient from '../../../../components/BlockDetailClient';
import type { BusinessBlock } from '../../../../components/BlocksClient';

type Params = { params: { id: string } };

export default async function BlockDetailPage({ params }: Params) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/');
  }

  const userEmail = session.user.email ?? 'Utilisateur';

  const { data, error } = await supabase
    .from('business_blocks')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    console.error('[BlockDetailPage] Supabase select error', error);
  }

  if (!data) {
    notFound();
  }

  const block = data as BusinessBlock;

  return (
    <AppShell userEmail={userEmail}>
      <section className="space-y-2 mb-6">
        <p className="text-xs text-slate-500">
          <a
            href="/app/blocks"
            className="text-[#b042b4] hover:underline"
          >
            ← Retour à la liste des blocks
          </a>
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {block.title}
        </h1>
        <p className="text-sm text-slate-500">
          Détail du block business et édition des infos de base.
        </p>
      </section>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <BlockDetailClient block={block} />
      </div>
    </AppShell>
  );
}
