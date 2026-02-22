"use client";

// app/auth/reset-password/page.tsx
// Rôle : page pour définir un nouveau mot de passe après lien "recovery".
// NOTE: en client pour fonctionner avec les tokens en hash traités par /auth/callback.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useTranslations } from "next-intl";
import SetPasswordForm from "@/components/SetPasswordForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Tipote<span className="text-primary">&trade;</span>
          </h1>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">{t("title")}</CardTitle>
            <CardDescription className="text-center">
              {t("description")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {ready ? (
              <SetPasswordForm mode="reset" />
            ) : (
              <div className="min-h-[120px] flex items-center justify-center">
                <p className="text-muted-foreground">{t("loading")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
