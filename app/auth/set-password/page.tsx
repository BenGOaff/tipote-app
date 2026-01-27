"use client";

// app/auth/set-password/page.tsx
// Rôle : page où l'utilisateur définit son mot de passe à la première connexion (invite).
// NOTE: en client pour fonctionner avec les tokens en hash traités par /auth/callback.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import SetPasswordForm from "@/components/SetPasswordForm";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (cancelled) return;

      if (!session?.user?.id) {
        router.replace("/?auth_error=not_authenticated");
        return;
      }

      // On vérifie si le mot de passe est déjà défini
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("password_set_at")
          .eq("id", session.user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // fail-open : on laisse l'utilisateur définir un mot de passe
          console.error("[set-password] profiles select error", error);
        }

        if ((profile as any)?.password_set_at) {
          router.replace("/app");
          return;
        }
      } catch (e) {
        // fail-open
        console.error("[set-password] profiles select catch", e);
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-slate-50 mb-2">Chargement…</h1>
          <p className="text-sm text-slate-400">On prépare la création de ton mot de passe.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">Crée ton mot de passe</h1>
        <p className="text-sm text-slate-400 mb-4">
          C’est la première fois que tu te connectes à Tipote. Choisis un mot de passe pour tes prochaines connexions.
        </p>
        <SetPasswordForm mode="first" />
      </div>
    </main>
  );
}
