"use client";

// app/auth/set-password/page.tsx
// Page où l'utilisateur définit son mot de passe à la première connexion (invite).
// Client component car on dépend de la session Supabase côté navigateur.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

      // Si le mot de passe est déjà défini, on renvoie vers l'app
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
        console.error("[set-password] profiles select catch", e);
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#F7F7FB] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/tipote-logo.png" alt="Tipote" width={40} height={40} priority />
            <span className="text-2xl font-bold text-gray-900">Tipote™</span>
          </div>
          <p className="text-gray-600">
            {ready ? (
              <>C’est ta première connexion. Choisis un mot de passe pour tes prochaines connexions.</>
            ) : (
              <>On prépare la création de ton mot de passe…</>
            )}
          </p>
        </div>

        {ready ? <SetPasswordForm mode="first" /> : <div className="text-sm text-gray-600">Chargement…</div>}

        <div className="mt-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Tipote™. Tous droits réservés.
        </div>
      </div>
    </main>
  );
}
