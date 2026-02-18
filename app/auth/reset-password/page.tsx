"use client";

// app/auth/reset-password/page.tsx
// Rôle : page pour définir un nouveau mot de passe après lien "recovery".
// NOTE: en client pour fonctionner avec les tokens en hash traités par /auth/callback.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useTranslations } from "next-intl";
import SetPasswordForm from "@/components/SetPasswordForm";

export default function ResetPasswordPage() {
  const t = useTranslations("resetPasswordPage");
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (cancelled) return;

      // Si pas de session, l'utilisateur n'a pas suivi le flow /auth/callback
      if (!session) {
        router.replace("/?auth_error=not_authenticated");
        return;
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
          <h1 className="text-xl font-semibold text-slate-50 mb-2">{t("loading")}</h1>
          <p className="text-sm text-slate-400">{t("loadingDesc")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">{t("title")}</h1>
        <p className="text-sm text-slate-400 mb-4">{t("description")}</p>
        <SetPasswordForm mode="reset" />
      </div>
    </main>
  );
}
