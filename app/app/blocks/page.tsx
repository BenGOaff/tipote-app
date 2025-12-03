// app/app/blocks/page.tsx
// Rôle : vue "Blocks business", protégée, avec liste + création de blocks.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';
import BlocksClient, { type BusinessBlock } from '@/components/BlocksClient';

export default async function BlocksPage() {
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
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[BlocksPage] Supabase select error', error);
  }

  const blocks = (data ?? []) as BusinessBlock[];

  return (
    <AppShell userEmail={userEmail}>
      <section className="space-y-2 mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Blocks business
        </h1>
        <p className="text-sm text-slate-500">
          Les blocks représentent les grandes briques de ton business : offres,
          tunnels, audiences, contenus clés, etc. On part simple pour la V1.
        </p>
      </section>

      <BlocksClient initialBlocks={blocks} />
    </AppShell>
  );
}
