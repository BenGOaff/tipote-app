// app/auth/callback/route.ts
// Rôle : callback Supabase pour PKCE + reset password + première connexion.

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tipote.com';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type'); // 'recovery', 'magiclink', 'signup', etc.

  const baseUrl = new URL(SITE_URL);

  if (!code) {
    return NextResponse.redirect(
      new URL('/?auth_error=missing_code', baseUrl),
    );
  }

  try {
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error', error);
      return NextResponse.redirect(
        new URL('/?auth_error=invalid_code', baseUrl),
      );
    }

    // À ce stade, la session est posée dans les cookies.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[auth/callback] getUser error', userError);
      return NextResponse.redirect(
        new URL('/?auth_error=unexpected', baseUrl),
      );
    }

    // 1) Si type=recovery => flux "mot de passe oublié"
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/auth/reset-password', baseUrl));
    }

    // 2) Sinon, on regarde si l'utilisateur a déjà un mot de passe
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('password_set_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[auth/callback] profiles select error', profileError);
      // En cas de doute, on laisse entrer dans /app, mais on log.
      return NextResponse.redirect(new URL('/app', baseUrl));
    }

    const mustSetPassword = !profile?.password_set_at;

    if (mustSetPassword) {
      // Première connexion : l'utilisateur doit définir un mot de passe
      return NextResponse.redirect(
        new URL('/auth/set-password', baseUrl),
      );
    }

    // 3) Cas normal : redirection vers l'app
    return NextResponse.redirect(new URL('/app', baseUrl));
  } catch (err) {
    console.error('[auth/callback] unexpected error', err);
    return NextResponse.redirect(
      new URL('/?auth_error=unexpected', baseUrl),
    );
  }
}
