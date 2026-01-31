"use client";

// app/auth/callback/CallbackClient.tsx
// Rôle : callback Supabase (invite / recovery / magic link)
// - Supporte tokens en hash (#access_token=...)
// - Supporte PKCE (?code=...)
// - Supporte aussi token_hash (?token_hash=...&type=invite|recovery|magiclink|signup...)
// - Redirige vers la bonne page Tipote (set-password / reset-password / app)
// - ✅ UX durable : si le lien est invalide/expiré/déjà consommé, on affiche une page Tipote + possibilité de renvoyer un lien via "mot de passe oublié" (resetPasswordForEmail).

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function parseHashParams(hash: string): Record<string, string> {
  const h = (hash || "").replace(/^#/, "").trim();
  const out: Record<string, string> = {};
  if (!h) return out;

  for (const part of h.split("&")) {
    const [k, v] = part.split("=");
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

function getLower(s: string | null | undefined) {
  return (s || "").trim().toLowerCase();
}

function isPkceMissingVerifierError(msg: string) {
  const m = (msg || "").toLowerCase();
  return m.includes("pkce") && m.includes("code verifier") && m.includes("not found");
}

function isLikelyExpiredOrInvalidLink(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("email link is invalid") ||
    m.includes("has expired") ||
    (m.includes("token") && (m.includes("expired") || m.includes("invalid"))) ||
    (m.includes("otp") && m.includes("invalid")) ||
    (m.includes("otp") && m.includes("expired")) ||
    (m.includes("invite") && m.includes("expired"))
  );
}

function normalizeCallbackErrorMessage(raw: string) {
  const msg = (raw || "").trim();
  if (!msg) return "Erreur inconnue";

  if (isLikelyExpiredOrInvalidLink(msg)) {
    return "Ce lien n’est plus valide. Il a peut-être déjà été utilisé ou a expiré.";
  }

  const m = msg.toLowerCase();
  if (m.includes("not authenticated") || m.includes("not_authenticated")) {
    return "Tu n’es pas connectée. Merci de relancer le lien depuis ton email.";
  }

  return msg;
}

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [rawErrorMsg, setRawErrorMsg] = useState<string>("");

  // UX durable (fallback) : permettre de renvoyer un lien de reset password
  const [email, setEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [resendMsg, setResendMsg] = useState<string>("");

  const code = useMemo(() => (searchParams?.get("code") || "").trim(), [searchParams]);
  const tokenHash = useMemo(
    () => (searchParams?.get("token_hash") || searchParams?.get("token") || "").trim(),
    [searchParams]
  );
  const type = useMemo(() => getLower(searchParams?.get("type")), [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        // ✅ 0) Cas "token_hash" (invite/recovery/magiclink/signup/email change…)
        // Important : ce flow NE dépend PAS d'un code_verifier stocké côté navigateur.
        if (tokenHash) {
          const otpType = (type || "magiclink") as any;

          const { error } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });

          if (error) throw error;

          // Session devrait être présente après verifyOtp
          const { data } = await supabase.auth.getSession();
          const session = data?.session;

          // Redirections selon type
          if (otpType === "recovery") {
            router.replace("/auth/reset-password");
            return;
          }
          if (otpType === "invite") {
            router.replace("/auth/set-password");
            return;
          }

          if (!session) {
            router.replace("/?auth_error=not_authenticated");
            return;
          }

          router.replace("/app");
          return;
        }

        // 1) Cas PKCE (query ?code=...)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            // Fix UX + diagnostic : les liens d'invite Supabase dashboard peuvent arriver sans code_verifier en storage.
            if (isPkceMissingVerifierError(error.message || "")) {
              router.replace("/?auth_error=pkce_missing_verifier");
              return;
            }
            throw error;
          }

          const { data } = await supabase.auth.getSession();
          const session = data?.session;

          const t = type;
          if (t === "recovery") {
            router.replace("/auth/reset-password");
            return;
          }
          if (t === "invite") {
            router.replace("/auth/set-password");
            return;
          }

          if (!session) {
            router.replace("/?auth_error=not_authenticated");
            return;
          }

          router.replace("/app");
          return;
        }

        // 2) Cas implicit hash (#access_token=...&refresh_token=...&type=invite|recovery)
        const hashParams = parseHashParams(window.location.hash || "");
        const access_token = (hashParams["access_token"] || "").trim();
        const refresh_token = (hashParams["refresh_token"] || "").trim();
        const hashType = (hashParams["type"] || "").trim().toLowerCase();

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;

          // Nettoie l'URL (évite de laisser les tokens visibles)
          try {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch {
            // ignore
          }

          if (hashType === "recovery") {
            router.replace("/auth/reset-password");
            return;
          }
          if (hashType === "invite") {
            router.replace("/auth/set-password");
            return;
          }

          router.replace("/app");
          return;
        }

        // 3) Rien à traiter -> retour login
        router.replace("/?auth_error=missing_callback_params");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setRawErrorMsg(msg);
        setStatus("error");
        setErrorMsg(normalizeCallbackErrorMessage(msg));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, code, tokenHash, type]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendMsg("");
    setResendStatus("idle");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setResendStatus("failed");
      setResendMsg("Merci de saisir un email valide.");
      return;
    }

    setResendStatus("sending");
    try {
      const supabase = getSupabaseBrowserClient();

      // ✅ Durable: si l’invite est expirée/déjà utilisée, on retombe sur le flow officiel "Forgot password"
      // qui envoie un lien valide (type=recovery) et permet à l’utilisateur de définir un mot de passe.
      const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (error) {
        console.error("[callback] resetPasswordForEmail error", error);
        setResendStatus("failed");
        setResendMsg("Impossible d’envoyer le lien. Réessaie dans quelques minutes.");
        return;
      }

      setResendStatus("sent");
      setResendMsg("C’est envoyé ! Vérifie ta boîte mail (et les spams).");
    } catch (err) {
      console.error("[callback] handleResend catch", err);
      setResendStatus("failed");
      setResendMsg("Impossible d’envoyer le lien. Réessaie dans quelques minutes.");
    }
  }

  // UI Tipote : même layout que /auth/set-password existant dans le repo
  if (status === "loading") {
    return (
      <main className="min-h-screen bg-[#F7F7FB] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Image src="/tipote-logo.png" alt="Tipote" width={40} height={40} priority />
              <span className="text-2xl font-bold text-gray-900">Tipote™</span>
            </div>
            <p className="text-gray-600">Connexion en cours…</p>
          </div>

          <div className="mt-4 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-gray-300 rounded-full animate-pulse" />
          </div>

          <div className="mt-8 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Tipote™. Tous droits réservés.
          </div>
        </div>
      </main>
    );
  }

  const showResend =
    isLikelyExpiredOrInvalidLink(rawErrorMsg) ||
    (errorMsg || "").toLowerCase().includes("n’est plus valide") ||
    (errorMsg || "").toLowerCase().includes("expire");

  return (
    <main className="min-h-screen bg-[#F7F7FB] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/tipote-logo.png" alt="Tipote" width={40} height={40} priority />
            <span className="text-2xl font-bold text-gray-900">Tipote™</span>
          </div>
          <p className="text-gray-600">Oups, ça n’a pas marché</p>
        </div>

        <p className="text-sm text-gray-600 text-center break-words">{errorMsg || "Erreur inconnue"}</p>

        {showResend && (
          <div className="mt-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-700 mb-3">
                Pas de panique : tu peux recevoir un nouveau lien pour définir ton mot de passe.
              </p>

              <form onSubmit={handleResend} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="resend-email">Ton email</Label>
                  <Input
                    id="resend-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@domaine.com"
                    autoComplete="email"
                  />
                </div>

                {resendMsg && (
                  <p
                    className={[
                      "text-sm rounded-md px-3 py-2 border",
                      resendStatus === "sent"
                        ? "text-primary bg-primary/10 border-primary/30"
                        : resendStatus === "failed"
                          ? "text-destructive bg-destructive/10 border-destructive/30"
                          : "text-gray-700 bg-white border-gray-200",
                    ].join(" ")}
                  >
                    {resendMsg}
                  </p>
                )}

                <Button className="w-full" type="submit" disabled={resendStatus === "sending"}>
                  {resendStatus === "sending" ? "Envoi…" : "Recevoir un nouveau lien"}
                </Button>
              </form>
            </div>
          </div>
        )}

        <Button className="mt-6 w-full" type="button" variant="outline" onClick={() => router.replace("/")}>
          Revenir à la connexion
        </Button>

        <div className="mt-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Tipote™. Tous droits réservés.
        </div>
      </div>
    </main>
  );
}
