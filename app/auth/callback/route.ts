// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Si pas de code dans l'URL → on renvoie vers la page de login
  if (!code) {
    return NextResponse.redirect(`${url.origin}/?auth_error=missing_code`);
  }

  try {
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error', error);
      // On renvoie vers la page de login avec un flag d’erreur
      return NextResponse.redirect(`${url.origin}/?auth_error=invalid_code`);
    }

    // Session OK → on envoie l'utilisateur sur /app
    return NextResponse.redirect(`${url.origin}/app`);
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect(`${url.origin}/?auth_error=unexpected`);
  }
}
