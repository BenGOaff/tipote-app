"use client";

// Dashboard /boost — deux features distinctes assumées en 2 sections :
//
//   A) Pod LinkedIn  → boost mutuel (membres se likent/commentent), karma,
//                       LinkedIn uniquement (la détection auto des nouveaux
//                       posts via Voyager est propre à LinkedIn).
//   B) Commentateur IA → 4 tons de commentaires proposés sur tout post visité,
//                         disponible sur 7 réseaux, pas de pod, pas de karma.
//
// L'état "Extension installée ?" est gating commun, donc rendu une fois en
// haut. Le reste descend dans les 2 sections, chacune avec son badge de scope.
//
// Détection extension : chrome.runtime.sendMessage(EXT_ID, {type:'ping'}).
// Si chrome.runtime n'existe pas (page non vue par une extension declarant
// externally_connectable sur ce domaine), on considère extension absente.

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";
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

// Liste des réseaux supportés par le commentateur IA. La couleur sert juste
// au badge visuel — la classe Tailwind est figée pour éviter les soucis de
// purge JIT (les classes dynamiques comme `bg-${color}-100` ne sont pas
// détectées par Tailwind à la compilation).
const AI_NETWORKS = [
  { name: "LinkedIn", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  { name: "Facebook", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  { name: "Threads", className: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" },
  { name: "Instagram", className: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200" },
  { name: "X", className: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" },
  { name: "TikTok", className: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" },
  { name: "Reddit", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" },
];

export default function BoostClient() {
  const t = useTranslations("boost");
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
        <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
      </Card>
    );
  }

  const linkedin = me?.linkedin_profile;
  const memberships = me?.memberships ?? [];
  const karma = me?.karma;

  return (
    <div className="space-y-8">
      {/* ────────── État extension Chrome (gating commun) ────────── */}
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
                ? t("extInstalled")
                : extStatus === "checking"
                  ? t("extChecking")
                  : t("extNotDetected")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {extStatus === "installed"
                ? t("extInstalledDesc")
                : extStatus === "checking"
                  ? " "
                  : t("extNotDetectedDesc")}
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
            {t("sync")}
          </Button>
        </div>
      </Card>

      {/* ════════════════════════════════════════════════════════════
          SECTION A — Pod d'engagement LinkedIn
          ════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("podTitle")}</h2>
            <Badge variant="outline" className="text-[10px] font-normal">
              {t("linkedInOnly")}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("podDesc")}
        </p>

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
                {linkedin ? t("linkedInLinked") : t("linkedInNotLinked")}
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
                    <div className="text-xs text-muted-foreground">{t("connectionSuccess")}</div>
                  )}
                  {linkedin.profile_url && (
                    <a
                      href={linkedin.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {t("seeProfile")} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {t("linkedInNotLinkedDesc")}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Pods */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">{t("podsJoined")}</h3>
          {memberships.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("podsJoinedEmpty")}
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
                    {t("members", { count: m.pods.member_count })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Karma */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">{t("karmaTitle")}</h3>
          {!karma ? (
            <p className="text-xs text-muted-foreground">
              {t("karmaEmpty")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold">{karma.boosts_given}</div>
                <div className="text-xs text-muted-foreground">{t("boostsGiven")}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t("thisWeekGiven", { count: karma.current_week_given })}
                  {karma.weekly_quota ? t("quotaSuffix", { quota: karma.weekly_quota }) : ""}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{karma.boosts_received}</div>
                <div className="text-xs text-muted-foreground">{t("boostsReceived")}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t("thisWeekReceived", { count: karma.current_week_received })}
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION B — Commentateur IA (7 réseaux, outil solo)
          ════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("aiCommenterTitle")}</h2>
            <Badge variant="outline" className="text-[10px] font-normal">
              {t("sevenNetworks")}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("aiCommenterDesc")}
        </p>

        <Card className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-2">{t("availableOn")}</h3>
            <div className="flex flex-wrap gap-2">
              {AI_NETWORKS.map((n) => (
                <span
                  key={n.name}
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${n.className}`}
                >
                  {n.name}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <p className="font-medium text-foreground">{t("howItWorks")}</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 leading-relaxed">
                <li>{t("step1")}</li>
                <li>{t("step2")}</li>
                <li>{t("step3")}</li>
                <li>{t("step4")}</li>
              </ol>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{t("goodToKnow")}</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 leading-relaxed">
                <li>{t("note1")}</li>
                <li>{t("note2")}</li>
                <li>{t("note3")}</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
