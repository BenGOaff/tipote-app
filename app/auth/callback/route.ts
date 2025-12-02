// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // 1) Pas de code -> retour à la page de login
  if (!code) {
    // URL relative -> le navigateur reste sur tipote.com
    return NextResponse.redirect('/?auth_error=missing_code');
  }

  try {
    const supabase = await getSupabaseServerClient();

    // 2) On échange le code contre une session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error', error);
      // Toujours une URL RELATIVE
      return NextResponse.redirect('/?auth_error=invalid_code');
    }

    // 3) Session OK -> on envoie l'utilisateur sur /app (toujours url relative)
    return NextResponse.redirect('/app');
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect('/?auth_error=unexpected');
  }
}
