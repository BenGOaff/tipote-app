"use client";

// app/auth/set-password/page.tsx
// Page où l'utilisateur définit son mot de passe à la première connexion (invite).
// Client component car on dépend de la session Supabase côté navigateur.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import SetPasswordForm from "@/components/SetPasswordForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Tipote<span className="text-primary">™</span>
          </h1>
          <p className="text-muted-foreground mt-2">Ton assistant stratégique intelligent</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">Créer ton mot de passe</CardTitle>
            <CardDescription className="text-center">
              C’est ta première connexion à Tipote. Choisis un mot de passe pour tes prochaines connexions.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {ready ? (
              <SetPasswordForm mode="first" />
            ) : (
              <div className="min-h-[120px] flex items-center justify-center">
                <p className="text-muted-foreground">Chargement...</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          © {new Date().getFullYear()} Tipote™. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}
