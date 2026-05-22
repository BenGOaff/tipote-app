// lib/affiliate/session.ts
//
// Helpers d'auth pour le dashboard affilié. On utilise Supabase Auth
// (déjà en place sur Tipote) pour l'envoi des magic links et la
// gestion de session. Le gating "est-ce que cet user est un affilié
// approuvé ?" se fait en checkant la table `affiliates` à chaque
// page du dashboard.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AffiliateSession = {
  sa: string;
  email: string;
  display_name: string | null;
  locale: string;
};

/** Lit la session Supabase + valide que l'email est un affilié actif.
 *  Retourne null si pas de session OU si l'email n'est pas un affilié.
 *  À appeler depuis chaque page server de /affiliate/* pour gating. */
export async function getAffiliateSession(): Promise<AffiliateSession | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // On set les cookies dans le response côté server component si
          // possible. Si appelé depuis un endroit qui ne supporte pas le
          // set (rendu pur), on ignore — le refresh Supabase ne marche pas
          // côté server component de toute façon.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore : on est dans un server component pur.
          }
        },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;

  const email = user.email.toLowerCase();
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("sa, email, display_name, locale, status")
    .ilike("email", email)
    .maybeSingle();
  const row = data as { sa: string; email: string; display_name: string | null; locale: string | null; status: string } | null;
  if (!row || row.status !== "active") return null;

  return {
    sa: row.sa,
    email: row.email,
    display_name: row.display_name,
    locale: row.locale ?? "fr",
  };
}
