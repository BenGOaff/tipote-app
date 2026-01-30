// components/SetPasswordForm.tsx
// Rôle : formulaire pour définir / redéfinir un mot de passe.
//
// Flow souhaité (Béné) :
// - invite -> définir mdp -> retour page connexion -> login email+mdp -> onboarding
// Donc après updateUser(password), on signOut puis redirect vers "/".

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, Lock, ArrowRight } from "lucide-react";

type SetPasswordFormProps = {
  mode: "first" | "reset";
};

export default function SetPasswordForm({ mode }: SetPasswordFormProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password || !confirmPassword) {
      setErrorMsg("Merci de remplir les deux champs.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    // Sécurité : 8 caractères min côté Tipote (on garde la règle existante)
    if (password.length < 8) {
      setErrorMsg("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setIsLoading(true);

    try {
      // 1) Mettre à jour le mot de passe Supabase
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        console.error("[SetPasswordForm] updateUser error", updateError);
        setErrorMsg("Impossible de mettre à jour le mot de passe.");
        setIsLoading(false);
        return;
      }

      // 2) Best-effort: marquer "password_set_at" si la table profiles existe
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!userError && user?.id) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              password_set_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          if (profileError) {
            console.error("[SetPasswordForm] update profiles error", profileError);
          }
        }
      } catch (e2) {
        console.error("[SetPasswordForm] profiles best-effort catch", e2);
      }

      setSuccessMsg(
        mode === "first"
          ? "Mot de passe créé. Tu peux maintenant te connecter."
          : "Mot de passe mis à jour. Tu peux maintenant te connecter."
      );

      // 3) Important : on déconnecte et on renvoie vers la page login (flow Béné)
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }

      setTimeout(() => {
        router.push("/?password_set=1");
      }, 700);
    } catch (err) {
      console.error("[SetPasswordForm] unexpected error", err);
      setErrorMsg("Erreur inattendue. Merci de réessayer.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">Nouveau mot de passe</Label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="new-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            className="pl-10 pr-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            className="pl-10"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Minimum 8 caractères</p>

      {errorMsg && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {errorMsg}
        </p>
      )}

      {successMsg && (
        <p className="text-sm text-primary bg-primary/10 border border-primary/30 rounded-md px-3 py-2">
          {successMsg}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          "Enregistrement..."
        ) : (
          <>
            Valider le mot de passe
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
