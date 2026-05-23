"use client";

// app/affiliate/signup/SignupClient.tsx
//
// Page d'activation auto venant de Systeme.io via merge tags.
// URL attendue : /signup?sa={affiliate_id}&email={contact_email}&first_name={first_name}
//
// L'affilié confirme ses infos pré-remplies + choisit sa langue +
// peut OPTIONNELLEMENT définir un mot de passe (sinon il se connecte
// au magic link uniquement). Submit → POST /affiliate/api/auth/signup.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Eye, EyeOff, Mail, User, KeyRound, Lock, CheckCircle2, ArrowRight, Globe2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";

const LOCALE_OPTIONS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
];

function detectBrowserLocale(): string {
  if (typeof navigator === "undefined") return "fr";
  const lang = (navigator.language || "fr").slice(0, 2).toLowerCase();
  return LOCALE_OPTIONS.some((l) => l.value === lang) ? lang : "fr";
}

export default function SignupClient() {
  const t = useDict();
  const searchParams = useSearchParams();
  const [sa, setSa] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("fr");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const saParam = searchParams.get("sa") || "";
    const emailParam = searchParams.get("email") || "";
    const first = searchParams.get("first_name") || "";
    const last = searchParams.get("last_name") || "";
    setSa(saParam);
    if (emailParam) setEmail(emailParam.toLowerCase());
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    if (fullName) setDisplayName(fullName);
    setLocale(detectBrowserLocale());

    // Fallback : si pas d'email dans l'URL, on regarde la session
    // Supabase. Cas du flow webhook tag où l'user arrive logged-in mais
    // sans merge tags dans l'URL (juste après magic link).
    if (!emailParam) {
      (async () => {
        try {
          const supabase = getSupabaseBrowserClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.email) setEmail(user.email.toLowerCase());
        } catch {
          // ignore
        }
      })();
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    if (password && password.length < 8) {
      setStatus("error");
      setErrorMsg(t.signup.err_weak_password);
      return;
    }

    try {
      const res = await fetch("/affiliate/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sa: sa.trim(),
          email: email.trim().toLowerCase(),
          display_name: displayName.trim() || null,
          locale,
          password: password || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        const reason = data.reason as string | undefined;
        if (reason === "invalid_sa") {
          setErrorMsg(t.signup.err_invalid_sa);
        } else if (reason === "email_not_in_systeme") {
          setErrorMsg(t.signup.err_email_not_in_systeme);
        } else if (reason === "invalid_email") {
          setErrorMsg(t.signup.err_invalid_email);
        } else if (reason === "weak_password") {
          setErrorMsg(t.signup.err_weak_password);
        } else if (reason === "send_failed") {
          setErrorMsg(t.signup.err_send_failed);
        } else {
          setErrorMsg(t.signup.err_generic);
        }
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMsg(t.signup.err_network);
    }
  }

  if (status === "sent") {
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
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl">{t.signup.success_title}</CardTitle>
              <CardDescription className="text-base">
                {t.signup.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                {password
                  ? interpolate(t.signup.success_with_password, { email })
                  : interpolate(t.signup.success_with_magic_link, { email })}
              </div>
              <Button asChild className="w-full">
                <Link href="/login">
                  {t.signup.go_to_login}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
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
            <CardTitle className="text-2xl font-bold">{t.signup.title}</CardTitle>
            <CardDescription>{t.signup.description}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.signup.label_email}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.login.placeholder_email}
                    disabled={status === "loading"}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t.signup.label_email_hint}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_name">
                  {t.signup.label_display_name}{" "}
                  <span className="text-muted-foreground font-normal">({t.common.optional})</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="display_name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t.signup.placeholder_display_name}
                    disabled={status === "loading"}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sa">{t.signup.label_sa}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="sa"
                    type="text"
                    required
                    value={sa}
                    onChange={(e) => setSa(e.target.value)}
                    placeholder="sa0016..."
                    disabled={status === "loading"}
                    className="pl-10 font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t.signup.label_sa_hint}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locale">{t.signup.label_locale}</Label>
                <Select
                  value={locale}
                  onValueChange={setLocale}
                  disabled={status === "loading"}
                >
                  <SelectTrigger id="locale" className="pl-10 relative">
                    <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t.signup.label_locale_hint}</p>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <Label htmlFor="password">
                  {t.signup.label_password}{" "}
                  <span className="text-muted-foreground font-normal">({t.common.optional})</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.signup.placeholder_password}
                    disabled={status === "loading"}
                    className="pl-10 pr-10"
                    autoComplete="new-password"
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
                <p className="text-xs text-muted-foreground">{t.signup.label_password_hint}</p>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={status === "loading" || !email || !sa}
              >
                {status === "loading" ? (
                  t.signup.activating
                ) : (
                  <>
                    {t.signup.activate}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-xs text-muted-foreground mt-6 text-center leading-relaxed">
              {t.signup.info_bottom}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
