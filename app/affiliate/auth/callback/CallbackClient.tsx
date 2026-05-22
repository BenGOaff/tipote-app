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
        // Honor `?next=` for the redirect (cas du flow webhook tag : on
        // arrive ici depuis le magic link envoyé par notre branche
        // CONTACT_TAG_ADDED, avec next=/signup pour finaliser).
        const next = searchParams.get("next");

        const verifyRes = await fetch("/affiliate/api/auth/verify", {
          method: "POST",
        });
        const verifyData = await verifyRes.json();

        if (!verifyRes.ok || !verifyData.ok) {
          // L'email Supabase n'est pas (encore) un affilié actif. Deux
          // cas possibles :
          //   1. Inscription via webhook tag → row pas encore créée →
          //      on redirige vers /signup où l'user finalise (saisie sa)
          //   2. Vraiment pas affilié → /login avec erreur
          if (next === "/signup") {
            router.replace("/signup");
            return;
          }
          await supabase.auth.signOut();
          router.replace("/login?error=not_affiliate");
          return;
        }

        // Affilié déjà actif → dashboard (ou next si demandé)
        router.replace(next && next.startsWith("/") ? next : "/");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
        setStatus("error");
      }
    })();
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground">
              Tipote<span className="text-primary">™</span>
            </h1>
            <p className="text-muted-foreground mt-2">Espace affiliation</p>
          </div>
          <div className="bg-card border border-destructive/30 rounded-lg p-6 text-center shadow-lg">
            <h2 className="text-lg font-semibold mb-2 text-destructive">
              Lien invalide ou expiré
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {errorMsg || "Ce lien a peut-être déjà été utilisé ou est expiré (30 min max)."}
            </p>
            <button
              onClick={() => router.replace("/login")}
              className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
            >
              Demander un nouveau lien
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-4xl font-bold text-foreground mb-2">
          Tipote<span className="text-primary">™</span>
        </div>
        <p className="text-muted-foreground">Validation en cours…</p>
      </div>
    </div>
  );
}
