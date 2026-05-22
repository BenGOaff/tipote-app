"use client";

// app/affiliate/login/LoginAffiliateForm.tsx
//
// Connexion à l'espace affilié Tipote. Inspiré directement de
// components/LoginForm.tsx (login dashboard principal) pour cohérence
// design — mêmes composants Card, Button, Input, icônes lucide.
//
// Deux modes :
//   - password : signInWithPassword classique
//   - magic    : magic link via /affiliate/api/auth/start (qui valide
//                que l'email est bien un affilié actif côté table
//                affiliates avant d'envoyer le lien)
//
// Note importante : pour le mode mot de passe, on ne peut pas filtrer
// côté backend "est-ce que c'est un affilié" car Supabase gère le
// signin directement côté client. Le filtre se fait POST-login dans
// le callback / chaque page (getAffiliateSession) qui redirige vers
// /login?error=not_affiliate si l'email n'est pas dans la table.

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Eye, EyeOff, Mail, Lock, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "password" | "magic";

export default function LoginAffiliateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const [mode, setMode] = useState<Mode>("password");
  const [showPassword, setShowPassword] = useState(false);

  // password mode
  const [emailPassword, setEmailPassword] = useState("");
  const [password, setPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);

  // magic mode
  const [emailMagic, setEmailMagic] = useState("");
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [errorMagic, setErrorMagic] = useState<string | null>(null);
  const [successMagic, setSuccessMagic] = useState<string | null>(null);

  const authError = searchParams.get("error");
  const banner =
    authError === "not_affiliate"
      ? "Cet email n'est pas reconnu comme un affilié actif. Inscris-toi d'abord via le bouton dans ton compte Systeme.io."
      : null;

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorPassword(null);
    const cleanEmail = emailPassword.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorPassword("Renseigne ton email et ton mot de passe.");
      return;
    }
    setLoadingPassword(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        setErrorPassword("Email ou mot de passe incorrect.");
        setLoadingPassword(false);
        return;
      }
      // Verify the email is in affiliates table (server-side check)
      const verifyRes = await fetch("/affiliate/api/auth/verify", { method: "POST" });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.ok) {
        await supabase.auth.signOut();
        setErrorPassword(
          "Cet email n'est pas reconnu comme affilié actif. Inscris-toi d'abord via Systeme.io.",
        );
        setLoadingPassword(false);
        return;
      }
      router.push("/");
    } catch {
      setErrorPassword("Une erreur s'est produite. Réessaie.");
      setLoadingPassword(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMagic(null);
    setSuccessMagic(null);
    const cleanEmail = emailMagic.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMagic("Renseigne ton email.");
      return;
    }
    setLoadingMagic(true);
    try {
      const res = await fetch("/affiliate/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.reason === "not_affiliate") {
          setErrorMagic(
            "Cet email n'est pas reconnu comme un affilié actif. Inscris-toi d'abord via Systeme.io.",
          );
        } else if (data.reason === "rate_limited") {
          setErrorMagic("Trop de tentatives. Réessaie dans quelques minutes.");
        } else {
          setErrorMagic("Impossible d'envoyer le lien. Réessaie.");
        }
        setLoadingMagic(false);
        return;
      }
      setSuccessMagic(
        `Lien envoyé à ${cleanEmail}. Vérifie ta boîte (et tes spams).`,
      );
    } catch {
      setErrorMagic("Une erreur s'est produite. Réessaie.");
    } finally {
      setLoadingMagic(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Tipote<span className="text-primary">™</span>
          </h1>
          <p className="text-muted-foreground mt-2">Espace affiliation</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">
              {mode === "password" ? "Connexion" : "Recevoir un lien magique"}
            </CardTitle>
            <CardDescription className="text-center">
              {mode === "password"
                ? "Accède à ton espace affilié Tipote × Tiquiz"
                : "On t'envoie un lien à usage unique par email"}
            </CardDescription>

            {banner && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{banner}</span>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {mode === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                {errorPassword && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorPassword}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="emailPassword">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emailPassword"
                      type="email"
                      placeholder="ton-email@example.com"
                      className="pl-10"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Mot de passe</Label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-sm text-primary hover:underline"
                    >
                      Oublié ?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loadingPassword}>
                  {loadingPassword ? (
                    "Connexion…"
                  ) : (
                    <>
                      Se connecter
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setMode("magic")}
                >
                  Recevoir un lien magique par email
                </Button>
              </form>
            )}

            {mode === "magic" && (
              <form onSubmit={handleMagicLink} className="space-y-4">
                {errorMagic && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMagic}
                  </div>
                )}
                {successMagic && (
                  <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary flex gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{successMagic}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="emailMagic">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emailMagic"
                      type="email"
                      placeholder="ton-email@example.com"
                      className="pl-10"
                      value={emailMagic}
                      onChange={(e) => setEmailMagic(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loadingMagic}>
                  {loadingMagic ? (
                    "Envoi…"
                  ) : (
                    <>
                      Envoyer le lien
                      <Mail className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setMode("password")}
                >
                  Revenir à la connexion mot de passe
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Pas de mot de passe à retenir. Clique sur le lien dans
                  l&apos;email pour te connecter.
                </p>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-center text-sm text-muted-foreground mb-3">
                Pas encore affilié ?
              </p>
              <Button variant="outline" className="w-full" asChild>
                <a
                  href="https://www.tipote.fr/affiliation"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Découvrir le programme d&apos;affiliation
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          © {new Date().getFullYear()} Tipote — Programme d&apos;affiliation
        </p>
      </div>
    </div>
  );
}
