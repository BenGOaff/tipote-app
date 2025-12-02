// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');

  // Si pas de token dans l'URL → on renvoie vers la page de login
  if (!tokenHash) {
    return NextResponse.redirect(`${url.origin}/?auth_error=missing_token`);
  }

  try {
    const supabase = await getSupabaseServerClient();

    // Flux Magic Link + PKCE recommandé par Supabase :
    const { data, error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: tokenHash,
    } as any);

    if (error || !data?.session) {
      console.error('[auth/callback] verifyOtp error', error);
      // On renvoie vers la page de login avec un flag d’erreur
      return NextResponse.redirect(`${url.origin}/?auth_error=otp_error`);
    }

    // Session OK → on envoie l'utilisateur sur /app
    return NextResponse.redirect(`${url.origin}/app`);
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect(`${url.origin}/?auth_error=unexpected`);
  }
}
