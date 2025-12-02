// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tipote.com';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // URL de base absolue → évite localhost, évite l'erreur "Invalid URL"
  const baseUrl = new URL(SITE_URL);

  // 1) Pas de code → retour à la home avec un flag d'erreur
  if (!code) {
    return NextResponse.redirect(
      new URL('/?auth_error=missing_code', baseUrl),
    );
  }

  try {
    // 2) On échange le code PKCE contre une session (cookies via @supabase/ssr)
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error', error);
      return NextResponse.redirect(
        new URL('/?auth_error=invalid_code', baseUrl),
      );
    }

    // 3) Session OK → /app (URL ABSOLUE)
    return NextResponse.redirect(new URL('/app', baseUrl));
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect(
      new URL('/?auth_error=unexpected', baseUrl),
    );
  }
}
