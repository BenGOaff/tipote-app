"use client";

// Dashboard /boost — état pod LinkedIn pour le user courant.
// Fetch /api/pod/me au mount + à chaque "Synchroniser l'extension".
// Détection extension via chrome.runtime.sendMessage(EXT_ID, {type:'ping'}).
// Si chrome.runtime n'existe pas (page non vue par une extension declarant
// externally_connectable sur ce domaine), on considère extension absente.

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { TIPOTE_EXTENSION_ID } from "@/lib/podBoost";

type PodMeResponse = {
  ok?: boolean;
  linkedin_profile: {
    linkedin_urn: string;
    full_name: string | null;
    headline: string | null;
    profile_url: string | null;
    language_detected: string | null;
    connected_at: string;
  } | null;
  memberships: Array<{
    pod_id: string;
    status: string;
    joined_at: string;
    pods: { id: string; slug: string; name: string; language: string; member_count: number };
  }>;
  karma: {
    boosts_given: number;
    boosts_received: number;
    weekly_quota: number;
    current_week_given: number;
    current_week_received: number;
  } | null;
};

type ExtensionStatus = "checking" | "installed" | "not_installed";

// Wrapper typed pour chrome.runtime.sendMessage (n'existe que quand une
// extension declare externally_connectable sur ce domaine). On utilise
// `unknown` pour le payload + un narrow runtime au lieu de @types/chrome
// (qui pollurait le scope global du frontend).
type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback?: (response: unknown) => void,
  ) => void;
  lastError?: { message: string } | undefined;
};
function getChromeRuntime(): ChromeRuntime | null {
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return w.chrome?.runtime ?? null;
}

export default function BoostClient() {
  const [me, setMe] = useState<PodMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [extStatus, setExtStatus] = useState<ExtensionStatus>("checking");
  const [syncing, setSyncing] = useState(false);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pod/me");
      const json = (await res.json()) as PodMeResponse;
      setMe(json);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ping de l'extension : si elle répond, c'est qu'elle est installée
  // ET autorisée à communiquer avec ce domaine (externally_connectable).
  const detectExtension = useCallback(() => {
    const runtime = getChromeRuntime();
    if (!runtime) {
      setExtStatus("not_installed");
      return;
    }
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setExtStatus("not_installed");
      }
    }, 2000);
    runtime.sendMessage(
      TIPOTE_EXTENSION_ID,
      { type: "ping", from: "tipote-frontend" },
      (resp) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        // chrome.runtime.lastError est set quand l'ID est inconnu ou
        // l'extension désinstallée. On lit l'erreur pour ne pas la voir
        // crasher la console (Chrome warning si on ignore).
        if (runtime.lastError || !resp) {
          setExtStatus("not_installed");
        } else {
          setExtStatus("installed");
        }
      },
    );
  }, []);

  useEffect(() => {
    void fetchMe();
    detectExtension();
  }, [fetchMe, detectExtension]);

  // "Synchroniser l'extension" — push à l'extension pour qu'elle ré-
  // appelle /api/pod/me et stocke en chrome.storage.local. Puis on
  // re-fetch nous aussi pour rafraîchir l'UI (l'extension a peut-être
  // entre-temps fait le matching LinkedIn).
  const onSync = useCallback(async () => {
    setSyncing(true);
    try {
      const runtime = getChromeRuntime();
      if (runtime) {
        runtime.sendMessage(TIPOTE_EXTENSION_ID, { type: "sync" }, () => {
          // ignore lastError; l'extension peut être absente
          void runtime.lastError;
        });
      }
      // Petit délai pour laisser l'extension faire son aller-retour
      // /api/pod/auth/connect (matching LinkedIn) avant qu'on refetch.
      await new Promise((r) => setTimeout(r, 1500));
      await fetchMe();
      detectExtension();
    } finally {
      setSyncing(false);
    }
  }, [fetchMe, detectExtension]);

  if (loading && !me) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </Card>
    );
  }

  const linkedin = me?.linkedin_profile;
  const memberships = me?.memberships ?? [];
  const karma = me?.karma;

  return (
    <div className="space-y-5">
      {/* État extension Chrome */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          {extStatus === "checking" ? (
            <Loader2 className="h-5 w-5 mt-0.5 animate-spin text-muted-foreground" />
          ) : extStatus === "installed" ? (
            <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">
              {extStatus === "installed"
                ? "Extension Chrome installée"
                : extStatus === "checking"
                  ? "Détection de l'extension…"
                  : "Extension Chrome non détectée"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {extStatus === "installed"
                ? "L'extension communique avec Tipote. Ouvre LinkedIn pour qu'elle détecte ton compte automatiquement."
                : extStatus === "checking"
                  ? " "
                  : "Installe l'extension Tipote dans Chrome (Chrome Web Store) ou recharge cette page si tu viens de l'installer."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing || extStatus !== "installed"}
            onClick={onSync}
            className="shrink-0"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Synchroniser
          </Button>
        </div>
      </Card>

      {/* État matching LinkedIn */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          {linkedin ? (
            <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">
              {linkedin ? "Compte LinkedIn lié" : "Compte LinkedIn pas encore lié"}
            </h3>
            {linkedin ? (
              <div className="mt-2 space-y-1">
                {linkedin.full_name && (
                  <div className="text-sm font-medium">{linkedin.full_name}</div>
                )}
                {linkedin.headline && (
                  <div className="text-xs text-muted-foreground">{linkedin.headline}</div>
                )}
                {!linkedin.full_name && !linkedin.headline && (
                  <div className="text-xs text-muted-foreground">Connexion réussie.</div>
                )}
                {linkedin.profile_url && (
                  <a
                    href={linkedin.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Voir le profil <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Ouvre LinkedIn (linkedin.com) avec l'extension installée. On récupère
                automatiquement ton URN et on te rattache au pod adapté.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Pods */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3">Pods rejoints</h3>
        {memberships.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun pod pour le moment. Tu seras auto-joiné au pod FR dès que ton
            compte LinkedIn sera détecté.
          </p>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.pod_id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="shrink-0 uppercase text-[10px]">
                    {m.pods.language}
                  </Badge>
                  <span className="truncate">{m.pods.name}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {m.pods.member_count} membres
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Karma */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3">Karma</h3>
        {!karma ? (
          <p className="text-xs text-muted-foreground">
            Tes statistiques d'engagement apparaîtront ici dès que tu auras donné
            ou reçu ton premier boost.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold">{karma.boosts_given}</div>
              <div className="text-xs text-muted-foreground">Boosts donnés (total)</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {karma.current_week_given} cette semaine
                {karma.weekly_quota ? ` · quota ${karma.weekly_quota}` : ""}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">{karma.boosts_received}</div>
              <div className="text-xs text-muted-foreground">Boosts reçus (total)</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {karma.current_week_received} cette semaine
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
