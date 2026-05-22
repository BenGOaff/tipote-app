// app/affiliate/login/page.tsx
//
// Login affilié via magic link. L'user saisit son email, on lui envoie
// un lien à usage unique vers /affiliate/auth/callback?token=...
// Le token est un JWT signé HMAC SHA256 valable 30 minutes.
//
// Auth séparée de l'auth Tipote app pour pas que la déconnexion d'un
// dashboard casse l'autre (cf. lib/affiliate/session.ts).

"use client";

import { useState } from "react";

export default function AffiliateLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/affiliate/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMsg(
          data.reason === "not_affiliate"
            ? "Cet email n'est pas reconnu comme un affilié actif. Contacte le support si tu penses que c'est une erreur."
            : data.reason === "rate_limited"
              ? "Trop de tentatives. Réessaie dans quelques minutes."
              : "Une erreur s'est produite. Réessaie."
        );
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMsg("Impossible de contacter le serveur. Vérifie ta connexion.");
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Connexion espace affilié
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          On t&apos;envoie un lien magique par email. Pas de mot de passe à retenir.
        </p>

        {status === "sent" ? (
          <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 text-xl">✓</span>
              <div>
                <p className="font-medium text-emerald-200">Email envoyé !</p>
                <p className="text-sm text-emerald-300/80 mt-1">
                  Clique sur le lien dans l&apos;email reçu à <strong>{email}</strong>.
                  Pense à vérifier tes spams.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="mt-4 text-xs text-emerald-300 hover:text-emerald-200 underline"
            >
              Réessayer avec un autre email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton-email@example.com"
                disabled={status === "loading"}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-100 placeholder-slate-500 disabled:opacity-50"
              />
            </div>

            {errorMsg && (
              <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-3 text-sm text-red-200">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !email}
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Envoi en cours…" : "Recevoir mon lien"}
            </button>
          </form>
        )}

        <p className="text-xs text-slate-500 mt-6 text-center">
          Pas encore affilié ?{" "}
          <a
            href="https://www.tipote.fr/affiliation"
            className="text-indigo-400 hover:text-indigo-300 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Découvrir le programme
          </a>
        </p>
      </div>
    </div>
  );
}
