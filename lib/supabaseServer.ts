// lib/supabaseServer.ts
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Client Supabase côté serveur (App Router + PKCE + cookies).
 *
 * Utilisable dans :
 * - Server Components (app/*)
 * - Route handlers (ex : app/auth/callback/route.ts)
 * - Server Actions
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing env NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing env NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  // Dans ta version de Next, cookies() est typé asynchrone.
  const cookieStore = await cookies();

  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Si on est dans un contexte read-only (certains Server Components),
          // on ignore l'erreur, les cookies peuvent être gérés ailleurs.
        }
      },
    },
  });

  return client;
}
