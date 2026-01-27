"use client";

// app/auth/callback/CallbackClient.tsx
// Rôle : callback Supabase (invite / recovery / magic link)
// - Supporte tokens en hash (#access_token=...)
// - Supporte PKCE (?code=...)
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

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const code = useMemo(() => (searchParams?.get("code") || "").trim(), [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        // 1) Cas PKCE (query ?code=...)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          const { data } = await supabase.auth.getSession();
          const session = data?.session;

          const t = (searchParams?.get("type") || "").toLowerCase();
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
        const type = (hashParams["type"] || "").trim().toLowerCase();

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;

          // Nettoie l'URL (évite de laisser les tokens visibles)
          try {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch {
            // ignore
          }

          if (type === "recovery") {
            router.replace("/auth/reset-password");
            return;
          }
          if (type === "invite") {
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
  }, [router, searchParams, code]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-slate-50 mb-2">Connexion en cours…</h1>
          <p className="text-sm text-slate-400">
            On finalise ton accès à Tipote. Tu vas être redirigée automatiquement.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">Oups, ça n’a pas marché</h1>
        <p className="text-sm text-slate-400">{errorMsg || "Impossible de finaliser la connexion. Réessaie depuis l’email."}</p>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Revenir à la connexion
        </button>
      </div>
    </main>
  );
}
