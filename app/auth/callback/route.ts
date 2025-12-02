// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Si pas de code dans l'URL → on retourne à la page de login
  if (!code) {
    return NextResponse.redirect(`${url.origin}/`);
  }

  try {
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error', error);
      // On renvoie vers la page de login avec un petit flag d’erreur
      return NextResponse.redirect(`${url.origin}/?auth_error=1`);
    }

    // Session OK → on envoie l'utilisateur sur /app
    return NextResponse.redirect(`${url.origin}/app`);
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect(`${url.origin}/?auth_error=1`);
  }
}
