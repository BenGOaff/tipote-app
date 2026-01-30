"use client";

// app/auth/callback/CallbackClient.tsx
// Rôle : callback Supabase (invite / recovery / magic link)
// - Supporte tokens en hash (#access_token=...)
// - Supporte PKCE (?code=...)
// - Supporte aussi token_hash (?token_hash=...&type=invite|recovery|magiclink|signup...) ✅ (fix PKCE verifier missing pour invites dashboard)
// - Redirige vers la bonne page Tipote (set-password / reset-password / app)

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

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
        setErrorMsg(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, code, tokenHash, type]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-slate-50 mb-2">Connexion en cours…</h1>
          <p className="text-sm text-slate-400">
            On finalise ton accès à Tipote. Tu vas être redirigée automatiquement.
          </p>
          <div className="mt-5 h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-emerald-500/80 rounded-full animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">Oups, ça n’a pas marché</h1>
        <p className="text-sm text-slate-400 break-words">{errorMsg || "Erreur inconnue"}</p>

        <button
          type="button"
          onClick={() => router.replace("/")}
          className="mt-6 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold py-3 transition"
        >
          Revenir à la connexion
        </button>
      </div>
    </main>
  );
}
