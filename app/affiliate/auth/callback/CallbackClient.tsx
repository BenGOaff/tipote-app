"use client";

// app/affiliate/auth/callback/CallbackClient.tsx
//
// Exchange du token Supabase venu du magic link → session active.
// Puis check côté serveur que l'email est dans la table affiliates.

import { useEffect, useRef, useState } from "react";
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
  const ranRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const supabase = getSupabaseBrowserClient();
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const errorDesc = searchParams.get("error_description");
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hashParams = parseHashParams(hash);

      if (errorDesc) {
        setErrorMsg(errorDesc);
        setStatus("error");
        return;
      }

      try {
        // Trois flux possibles selon la version Supabase et le type de
        // magic link envoyé : code (PKCE), token_hash (verifyOtp), ou
        // access_token dans le hash (implicit). On essaie dans l'ordre.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "email",
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (hashParams.access_token) {
          const { error } = await supabase.auth.setSession({
            access_token: hashParams.access_token,
            refresh_token: hashParams.refresh_token ?? "",
          });
          if (error) throw error;
        } else {
          throw new Error("Aucun token reçu — lien invalide");
        }

        // Session établie côté Supabase. Maintenant on demande au serveur
        // de valider que l'email est bien un affilié actif. La table
        // d'affiliés n'est accessible qu'au service role, donc check serveur.
        const verifyRes = await fetch("/affiliate/api/auth/verify", {
          method: "POST",
        });
        const verifyData = await verifyRes.json();

        if (!verifyRes.ok || !verifyData.ok) {
          // L'email Supabase n'est pas un affilié → on signout et redirect
          await supabase.auth.signOut();
          router.replace("/login?error=not_affiliate");
          return;
        }

        router.replace("/");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
        setStatus("error");
      }
    })();
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-slate-900/60 border border-red-800/50 rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-2 text-red-200">Lien invalide ou expiré</h1>
          <p className="text-sm text-slate-400 mb-6">
            {errorMsg || "Ce lien a peut-être déjà été utilisé ou est expiré (30 min max)."}
          </p>
          <button
            onClick={() => router.replace("/login")}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium"
          >
            Demander un nouveau lien
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-slate-300">Validation en cours…</p>
      </div>
    </div>
  );
}
