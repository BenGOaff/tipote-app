"use client";

// app/affiliate/login/LoginAffiliateForm.tsx
//
// Connexion à l'espace affilié Tipote. Inspiré du LoginForm Tipote
// principal pour cohérence design. Deux modes : password ou magic link.
// Multilang via useDict() — wording dans /affiliate/i18n/.

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Eye, EyeOff, Mail, Lock, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AFFILIATE_SIGNUP_URL } from "@/lib/affiliate/urls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";

type Mode = "password" | "magic";

export default function LoginAffiliateForm() {
  const t = useDict();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const [mode, setMode] = useState<Mode>("password");
  const [showPassword, setShowPassword] = useState(false);

  const [emailPassword, setEmailPassword] = useState("");
  const [password, setPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);

  const [emailMagic, setEmailMagic] = useState("");
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [errorMagic, setErrorMagic] = useState<string | null>(null);
  const [successMagic, setSuccessMagic] = useState<string | null>(null);

  const authError = searchParams.get("error");
  const banner = authError === "not_affiliate" ? t.login.banner_not_affiliate : null;

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorPassword(null);
    const cleanEmail = emailPassword.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorPassword(t.login.err_fill_credentials);
      return;
    }
    setLoadingPassword(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        setErrorPassword(t.login.err_invalid_credentials);
        setLoadingPassword(false);
        return;
      }
      const verifyRes = await fetch("/affiliate/api/auth/verify", { method: "POST" });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.ok) {
        await supabase.auth.signOut();
        setErrorPassword(t.login.err_not_affiliate);
        setLoadingPassword(false);
        return;
      }
      // Navigation DURE (pas router.push) : signInWithPassword vient de
      // poser le cookie de session côté navigateur. Un router.push fait
      // une nav soft dont le rendu SSR du layout affilié peut s'exécuter
      // AVANT que le cookie soit lisible côté serveur → getAffiliateSession
      // renvoie null → sidebar absente jusqu'au refresh (drame Gwenn 8
      // juin 2026 : "après mon inscription je n'avais pas le panneau de
      // gauche"). window.location.assign force un document request qui
      // embarque le cookie → le layout voit la session du premier coup.
      window.location.assign("/");
    } catch {
      setErrorPassword(t.login.err_generic);
      setLoadingPassword(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMagic(null);
    setSuccessMagic(null);
    const cleanEmail = emailMagic.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMagic(t.login.err_fill_email);
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
          setErrorMagic(t.login.err_not_affiliate);
        } else if (data.reason === "rate_limited") {
          setErrorMagic(t.login.err_rate_limit);
        } else {
          setErrorMagic(t.login.err_send_failed);
        }
        setLoadingMagic(false);
        return;
      }
      setSuccessMagic(interpolate(t.login.magic_link_sent, { email: cleanEmail }));
    } catch {
      setErrorMagic(t.login.err_generic);
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
          <p className="text-muted-foreground mt-2">{t.layout.space_subtitle}</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">
              {mode === "password" ? t.login.title_password : t.login.title_magic}
            </CardTitle>
            <CardDescription className="text-center">
              {mode === "password" ? t.login.description_password : t.login.description_magic}
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
                  <Label htmlFor="emailPassword">{t.login.label_email}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emailPassword"
                      type="email"
                      placeholder={t.login.placeholder_email}
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
                    <Label htmlFor="password">{t.login.label_password}</Label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-sm text-primary hover:underline"
                    >
                      {t.login.forgot_password}
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
                      aria-label={showPassword ? t.login.hide_password : t.login.show_password}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loadingPassword}>
                  {loadingPassword ? (
                    t.login.signing_in
                  ) : (
                    <>
                      {t.login.sign_in}
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
                  {t.login.switch_to_magic}
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
                  <Label htmlFor="emailMagic">{t.login.label_email}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emailMagic"
                      type="email"
                      placeholder={t.login.placeholder_email}
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
                    t.login.sending_magic_link
                  ) : (
                    <>
                      {t.login.send_magic_link}
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
                  {t.login.switch_to_password}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  {t.login.magic_link_info}
                </p>
              </form>
            )}

            {/* Béné, 6 août 2026 : "sur l'accueil d'affiliate, le lien
                d'inscription pour ceux qui veulent voir l'espace affilié,
                comme ça ils peuvent s'inscrire directement".

                Ce bouton pointait vers les CONDITIONS GÉNÉRALES. Quelqu'un
                qui arrive ici sans compte lisait donc un texte juridique
                au lieu de pouvoir s'inscrire : un cul-de-sac, à l'endroit
                exact où on perd le plus de monde. La page d'affiliation
                explique le programme ET permet de s'inscrire. */}
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-center text-sm text-muted-foreground mb-3">
                {t.login.no_account}
              </p>
              <Button variant="outline" className="w-full" asChild>
                <a
                  href={AFFILIATE_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.login.discover_program}
                </a>
              </Button>
              {/* LA PORTE D'ENTRÉE DIRECTE (Béné, 25 août 2026 :
                  "pourquoi un type sans systeme io ne pourrait pas
                  devenir affilié chez nous ??").

                  Elle l'avait déjà demandée le 6 août ("le lien
                  d'inscription pour ceux qui veulent voir l'espace
                  affilié, comme ça ils peuvent s'inscrire directement").
                  Le bouton au dessus mène à la page qui EXPLIQUE le
                  programme, et son parcours passe par Systeme.io : tant
                  que l'inscription exigeait un identifiant Systeme.io,
                  c'était la seule route possible. Elle ne l'est plus.

                  Lien interne, donc <Link> : on ne fait pas quitter
                  l'espace pour une page de l'espace. */}
              <p className="mt-3 text-center text-sm">
                <Link href="/signup" className="text-primary underline underline-offset-4 hover:opacity-80">
                  {t.login.signup_direct}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {interpolate(t.layout.copyright, { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}
