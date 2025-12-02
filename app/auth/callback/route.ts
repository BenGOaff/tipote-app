// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // 1) Pas de code → retour à la home avec un flag d'erreur
  if (!code) {
    return NextResponse.redirect('/?auth_error=missing_code');
  }

  try {
    // 2) On récupère le client Supabase côté serveur (PKCE + cookies)
    const supabase = await getSupabaseServerClient();

    // 3) On échange le code PKCE contre une session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error', error);
      return NextResponse.redirect('/?auth_error=invalid_code');
    }

    // 4) Session OK → redirection vers /app
    // URL RELATIVE → pas de retour sur localhost via nginx.
    return NextResponse.redirect('/app');
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect('/?auth_error=unexpected');
  }
}
