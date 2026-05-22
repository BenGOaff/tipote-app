"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const [sa, setSa] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("fr");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Préremplit depuis l'URL au mount.
  useEffect(() => {
    const saParam = searchParams.get("sa") || "";
    const emailParam = searchParams.get("email") || "";
    const first = searchParams.get("first_name") || "";
    const last = searchParams.get("last_name") || "";
    setSa(saParam);
    setEmail(emailParam.toLowerCase());
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    if (fullName) setDisplayName(fullName);
    setLocale(detectBrowserLocale());
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/affiliate/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sa: sa.trim(),
          email: email.trim().toLowerCase(),
          display_name: displayName.trim() || null,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        const reason = data.reason as string | undefined;
        if (reason === "invalid_sa") {
          setErrorMsg(
            "L'identifiant affilié n'a pas le bon format. Vérifie qu'il commence par « sa » suivi d'une suite de caractères (ex: sa00168...).",
          );
        } else if (reason === "email_not_in_systeme") {
          setErrorMsg(
            "On ne trouve pas cet email dans Systeme.io. Inscris-toi d'abord comme affilié sur Systeme.io, puis reviens ici.",
          );
        } else if (reason === "invalid_email") {
          setErrorMsg("Email invalide.");
        } else if (reason === "send_failed") {
          setErrorMsg("Compte créé mais on n'a pas réussi à envoyer le lien de connexion. Contacte le support.");
        } else {
          setErrorMsg("Une erreur s'est produite. Réessaie ou contacte le support.");
        }
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMsg("Impossible de contacter le serveur. Vérifie ta connexion.");
    }
  }

  if (status === "sent") {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2 text-emerald-100">
            Bienvenue !
          </h1>
          <p className="text-sm text-emerald-200/80 mb-6 leading-relaxed">
            Ton espace affilié est activé. On t&apos;a envoyé un lien de connexion
            à <strong>{email}</strong>.<br />
            Clique sur le lien dans le mail pour accéder à ton dashboard.
            Pense à vérifier tes spams si tu ne le reçois pas dans la minute.
          </p>
          <a
            href="/login"
            className="inline-block text-sm text-emerald-200 hover:text-emerald-100 underline"
          >
            Déjà inscrit ? Aller à la connexion
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Active ton espace Creators
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Vérifie les infos ci-dessous, on les a pré-remplies depuis Systeme.io.
          Tu peux corriger si besoin.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton-email@example.com"
              disabled={status === "loading"}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-100 placeholder-slate-500 disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              C&apos;est celui de ton compte Systeme.io.
            </p>
          </div>

          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-slate-300 mb-2">
              Prénom ou nom à afficher{" "}
              <span className="text-slate-500 font-normal">(optionnel)</span>
            </label>
            <input
              id="display_name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Comment on t'appelle ?"
              disabled={status === "loading"}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-100 placeholder-slate-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="sa" className="block text-sm font-medium text-slate-300 mb-2">
              Identifiant affilié Systeme.io
            </label>
            <input
              id="sa"
              type="text"
              required
              value={sa}
              onChange={(e) => setSa(e.target.value)}
              placeholder="sa0016..."
              disabled={status === "loading"}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-100 placeholder-slate-500 disabled:opacity-50 font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Tu le trouves dans Systeme.io → ton dashboard affiliation → ton
              lien (la partie après <code>?sa=</code>).
            </p>
          </div>

          <div>
            <label htmlFor="locale" className="block text-sm font-medium text-slate-300 mb-2">
              Langue
            </label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              disabled={status === "loading"}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-100 disabled:opacity-50"
            >
              {LOCALE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              On t&apos;enverra les contenus promo dans cette langue.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-3 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !email || !sa}
            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? "Activation en cours…" : "Activer mon espace"}
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-6 text-center">
          Tu reçois déjà un email à chaque commission. Cet espace te donne en
          plus : ressources promos, statistiques, paliers de commission, et
          accès démo aux outils Tipote & Tiquiz.
        </p>
      </div>
    </div>
  );
}
