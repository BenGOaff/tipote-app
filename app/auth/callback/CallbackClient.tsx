"use client";

// app/auth/callback/CallbackClient.tsx
// Rôle : callback Supabase (invite / recovery / magic link)
// - Supporte tokens en hash (#access_token=...)
// - Supporte PKCE (?code=...)
// - Supporte aussi token_hash (?token_hash=...&type=invite|recovery|magiclink|signup...) ✅ (fix PKCE verifier missing pour invites dashboard)
// - Redirige vers la bonne page Tipote (set-password / reset-password / app)

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";

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

function normalizeCallbackErrorMessage(raw: string) {
  const msg = (raw || "").trim();
  const m = msg.toLowerCase();

  // Cas très fréquent quand on reclique sur un lien déjà consommé / expiré
  if (m.includes("email link is invalid") || m.includes("has expired")) {
    return "Ce lien n’est plus valide. Il a peut-être déjà été utilisé ou a expiré.";
  }
  if (m.includes("token") && (m.includes("expired") || m.includes("invalid"))) {
    return "Ce lien n’est plus valide. Il a peut-être déjà été utilisé ou a expiré.";
  }

  // Fallback : on garde le message brut (utile en debug)
  return msg || "Erreur inconnue";
}

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

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
        setStatus("error");
        setErrorMsg(normalizeCallbackErrorMessage(msg));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, code, tokenHash, type]);

  // UI Tipote (même layout que /auth/set-password existant dans le repo)
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

        <Button className="mt-6 w-full" type="button" onClick={() => router.replace("/")}>
          Revenir à la connexion
        </Button>

        <div className="mt-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Tipote™. Tous droits réservés.
        </div>
      </div>
    </main>
  );
}
