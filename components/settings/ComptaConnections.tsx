"use client";

// "Mes connexions" — section de l'onglet Compta dans Paramètres.
//
// Pour la phase 1c, seul Stripe est dispo. Mollie et PayPal arrivent
// dans 1d (même architecture, juste de nouveaux providers à brancher).
//
// État affiché par connexion :
//   • "Synchronisation initiale en cours…" tant que initial_sync_done_at est null
//   • "Synchronisé il y a Xh" sur les autres syncs
//   • Erreur visible si le dernier run a planté (clé révoquée, etc.)
// Bouton "Synchroniser maintenant" pour forcer une maj sans attendre
// le cron quotidien (5h du matin).

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plug,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

interface Connection {
  id: string;
  provider: string;
  last_sync_at: string | null;
  initial_sync_done_at: string | null;
  last_sync_error: string | null;
  disabled_at: string | null;
  created_at: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Stripe",
  mollie: "Mollie",
  paypal: "PayPal",
};

const PROVIDER_COLORS: Record<string, string> = {
  stripe: "bg-[#635bff]",
  mollie: "bg-[#0d2f3f]",
  paypal: "bg-[#0070ba]",
};

type RelativeT = (key: string, values?: Record<string, string | number>) => string;

function formatRelative(iso: string | null, t: RelativeT): string {
  if (!iso) return t("relative.never");
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t("relative.justNow");
  if (ms < 3_600_000) return t("relative.minutesAgo", { count: Math.floor(ms / 60_000) });
  if (ms < 86_400_000) return t("relative.hoursAgo", { count: Math.floor(ms / 3_600_000) });
  return t("relative.daysAgo", { count: Math.floor(ms / 86_400_000) });
}

export default function ComptaConnections() {
  const t = useTranslations("compta.connections");
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncPending, startSyncTransition] = useTransition();
  const [showStripeForm, setShowStripeForm] = useState(false);
  const [showPaypalForm, setShowPaypalForm] = useState(false);
  const [showMollieForm, setShowMollieForm] = useState(false);
  const { toast } = useToast();

  async function reload() {
    try {
      const res = await fetch("/api/compta/connections");
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; connections?: Connection[] }
        | null;
      if (json?.ok && Array.isArray(json.connections)) {
        setConnections(json.connections);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function syncNow() {
    startSyncTransition(async () => {
      try {
        const res = await fetch("/api/compta/connections/sync-now", { method: "POST" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; total?: number; failed?: number; outcomes?: Array<{ provider: string; ok: boolean; error?: string }> }
          | null;
        if (json?.ok) {
          const success = (json.total ?? 0) - (json.failed ?? 0);
          toast({
            title: success > 0 ? t("syncToast.upToDate", { count: success }) : t("syncToast.noNew"),
            description:
              json.failed && json.failed > 0
                ? t("syncToast.failed", { count: json.failed })
                : undefined,
          });
          await reload();
        } else {
          toast({ title: t("syncToast.error"), variant: "destructive" });
        }
      } catch (e) {
        toast({
          title: t("errors.generic"),
          description: e instanceof Error ? e.message : t("errors.unknown"),
          variant: "destructive",
        });
      }
    });
  }

  async function disconnect(id: string) {
    if (!confirm(t("disconnect.confirm"))) return;
    try {
      // Endpoint générique — déconnecte n'importe quel provider
      // (Stripe, PayPal, Mollie quand il sera là).
      const res = await fetch("/api/compta/connections/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (json?.ok) {
        toast({ title: t("disconnect.done") });
        await reload();
      } else {
        toast({ title: t("errors.generic"), description: json?.error, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: t("errors.generic"),
        description: e instanceof Error ? e.message : t("errors.unknown"),
        variant: "destructive",
      });
    }
  }

  const stripeConn = connections.find((c) => c.provider === "stripe" && !c.disabled_at);
  const paypalConn = connections.find((c) => c.provider === "paypal" && !c.disabled_at);
  const mollieConn = connections.find((c) => c.provider === "mollie" && !c.disabled_at);
  const activeCount = connections.filter((c) => !c.disabled_at).length;

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Plug className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg">{t("title")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t.rich("subtitle", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
        </div>
        {activeCount > 0 ? (
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncPending}>
            {syncPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
            )}
            {t("syncNow")}
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        {/* Stripe */}
        {stripeConn ? (
          <ConnectionCard
            connection={stripeConn}
            onDisconnect={() => disconnect(stripeConn.id)}
          />
        ) : showStripeForm ? (
          <StripeConnectForm
            onConnected={async () => {
              setShowStripeForm(false);
              await reload();
              toast({
                title: t("stripeToast.connected"),
                description: t("stripeToast.initialSync"),
              });
            }}
            onCancel={() => setShowStripeForm(false)}
          />
        ) : (
          <ConnectButton
            providerKey="stripe"
            label={t("connect.stripe.label")}
            description={t("connect.stripe.description")}
            onClick={() => setShowStripeForm(true)}
          />
        )}

        {/* PayPal — actif en 1d */}
        {paypalConn ? (
          <ConnectionCard
            connection={paypalConn}
            onDisconnect={() => disconnect(paypalConn.id)}
          />
        ) : showPaypalForm ? (
          <PaypalConnectForm
            onConnected={async () => {
              setShowPaypalForm(false);
              await reload();
              toast({
                title: t("paypalToast.connected"),
                description: t("paypalToast.initialSync"),
              });
            }}
            onCancel={() => setShowPaypalForm(false)}
          />
        ) : (
          <ConnectButton
            providerKey="paypal"
            label={t("connect.paypal.label")}
            description={t("connect.paypal.description")}
            onClick={() => setShowPaypalForm(true)}
          />
        )}

        {/* Mollie */}
        {mollieConn ? (
          <ConnectionCard
            connection={mollieConn}
            onDisconnect={() => disconnect(mollieConn.id)}
          />
        ) : showMollieForm ? (
          <MollieConnectForm
            onConnected={async () => {
              setShowMollieForm(false);
              await reload();
              toast({
                title: t("mollieToast.connected"),
                description: t("mollieToast.initialSync"),
              });
            }}
            onCancel={() => setShowMollieForm(false)}
          />
        ) : (
          <ConnectButton
            providerKey="mollie"
            label={t("connect.mollie.label")}
            description={t("connect.mollie.description")}
            onClick={() => setShowMollieForm(true)}
          />
        )}
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Card : connexion existante
 * ────────────────────────────────────────────────────────────────── */

function ConnectionCard({
  connection,
  onDisconnect,
}: {
  connection: Connection;
  onDisconnect: () => void;
}) {
  const t = useTranslations("compta.connections");
  const label = PROVIDER_LABELS[connection.provider] ?? connection.provider;
  const color = PROVIDER_COLORS[connection.provider] ?? "bg-primary";
  const initialSyncing = !connection.initial_sync_done_at;
  const hasError = !!connection.last_sync_error;

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`${color} text-white rounded p-1.5 shrink-0`}>
            <Plug className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold">{label}</p>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              {initialSyncing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{t("status.initialSyncing")}</span>
                </>
              ) : hasError ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-destructive">{t("status.error")}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{t("status.syncedAt", { when: formatRelative(connection.last_sync_at, t) })}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          {t("disconnect.button")}
        </Button>
      </div>
      {hasError ? (
        <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          {connection.last_sync_error}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Bouton "Connecter Stripe" (état initial)
 * ────────────────────────────────────────────────────────────────── */

function ConnectButton({
  providerKey,
  label,
  description,
  onClick,
}: {
  providerKey: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  const color = PROVIDER_COLORS[providerKey] ?? "bg-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-dashed border-border p-4 hover:border-primary hover:bg-muted/40 transition-colors flex items-center gap-3"
    >
      <div className={`${color} text-white rounded p-1.5 shrink-0`}>
        <Plug className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

function DisabledConnectButton({ providerKey, label }: { providerKey: string; label: string }) {
  const t = useTranslations("compta.connections");
  const color = PROVIDER_COLORS[providerKey] ?? "bg-muted";
  return (
    <div className="w-full rounded-lg border border-dashed border-border p-4 flex items-center gap-3 opacity-50">
      <div className={`${color} text-white rounded p-1.5 shrink-0`}>
        <Plug className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{t("comingSoon")}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Form pour poser la Restricted Key Stripe
 * ────────────────────────────────────────────────────────────────── */

function StripeConnectForm({
  onConnected,
  onCancel,
}: {
  onConnected: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("compta.connections");
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/compta/connections/stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restrictedKey: key.trim() }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; livemode?: boolean }
          | null;
        if (!json?.ok) {
          setError(json?.error ?? t("errors.generic"));
          return;
        }
        if (json.livemode === false) {
          toast({
            title: t("stripeForm.testModeToast.title"),
            description: t("stripeForm.testModeToast.description"),
          });
        }
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.network"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">{t("stripeForm.heading")}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t.rich("stripeForm.intro", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      {/* Guide pas-à-pas */}
      <div className="text-xs text-muted-foreground space-y-1.5 bg-background border border-border rounded p-3">
        <p className="font-semibold text-foreground">{t("stripeForm.guideTitle")}</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>
            {t("stripeForm.step1Prefix")}{" "}
            <a
              href="https://dashboard.stripe.com/apikeys/create"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              {t("stripeForm.step1Link")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            {t("stripeForm.step2Prefix")} <code className="px-1 bg-muted rounded">Tipote – Compta (lecture)</code>
          </li>
          <li>
            {t.rich("stripeForm.step3", {
              strong: (chunks) => <strong>{chunks}</strong>,
              code1: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
              code2: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
              code3: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
            })}
          </li>
          <li>
            {t.rich("stripeForm.step4", {
              code: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
            })}
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stripe-key">{t("stripeForm.label")}</Label>
        <div className="relative">
          <Input
            id="stripe-key"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="rk_live_…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={pending}
            className="font-mono pr-10"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={visible ? t("stripeForm.hideKey") : t("stripeForm.showKey")}
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">
          {t("stripeForm.storedEncrypted")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !key.trim()}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("connecting")}
            </>
          ) : (
            t("connect.button")
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Form pour connecter PayPal — clientId + secret + mode (live/sandbox)
 * ────────────────────────────────────────────────────────────────── */

function PaypalConnectForm({
  onConnected,
  onCancel,
}: {
  onConnected: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("compta.connections");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"live" | "sandbox">("live");
  const [secretVisible, setSecretVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/compta/connections/paypal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: clientId.trim(),
            secret: secret.trim(),
            mode,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; mode?: string }
          | null;
        if (!json?.ok) {
          setError(json?.error ?? t("errors.generic"));
          return;
        }
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.network"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">{t("paypalForm.heading")}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t.rich("paypalForm.intro", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      {/* Guide pas-à-pas */}
      <div className="text-xs text-muted-foreground space-y-1.5 bg-background border border-border rounded p-3">
        <p className="font-semibold text-foreground">{t("paypalForm.guideTitle")}</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>
            {t("paypalForm.step1Prefix")}{" "}
            <a
              href="https://developer.paypal.com/dashboard/applications/live"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              {t("paypalForm.step1Link")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            {t.rich("paypalForm.step2", {
              code1: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
              code2: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
            })}
          </li>
          <li>
            {t.rich("paypalForm.step3", {
              strong: (chunks) => <strong>{chunks}</strong>,
              em1: (chunks) => <em>{chunks}</em>,
              em2: (chunks) => <em>{chunks}</em>,
              code: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
            })}
          </li>
          <li>
            {t.rich("paypalForm.step4", {
              strong1: (chunks) => <strong>{chunks}</strong>,
              strong2: (chunks) => <strong>{chunks}</strong>,
              em: (chunks) => <em>{chunks}</em>,
            })}
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paypal-mode">{t("paypalForm.modeLabel")}</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as "live" | "sandbox")}>
          <SelectTrigger id="paypal-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">{t("paypalForm.modeLive")}</SelectItem>
            <SelectItem value="sandbox">{t("paypalForm.modeSandbox")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === "sandbox"
            ? t("paypalForm.modeSandboxHelp")
            : t("paypalForm.modeLiveHelp")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paypal-client-id">{t("paypalForm.clientIdLabel")}</Label>
        <Input
          id="paypal-client-id"
          type="text"
          autoComplete="off"
          placeholder="AY1234abcd..."
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={pending}
          className="font-mono"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="paypal-secret">{t("paypalForm.secretLabel")}</Label>
        <div className="relative">
          <Input
            id="paypal-secret"
            type={secretVisible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="EH1234abcd..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            disabled={pending}
            className="font-mono pr-10"
          />
          <button
            type="button"
            onClick={() => setSecretVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={secretVisible ? t("paypalForm.hideSecret") : t("paypalForm.showSecret")}
          >
            {secretVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("paypalForm.storedEncrypted")}
        </p>
      </div>

      {error ? (
        <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !clientId.trim() || !secret.trim()}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("connecting")}
            </>
          ) : (
            t("connect.button")
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Form pour connecter Mollie — clé API simple (live_… ou test_…)
 * ────────────────────────────────────────────────────────────────── */

function MollieConnectForm({
  onConnected,
  onCancel,
}: {
  onConnected: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("compta.connections");
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/compta/connections/mollie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; mode?: string }
          | null;
        if (!json?.ok) {
          setError(json?.error ?? t("errors.generic"));
          return;
        }
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.network"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">{t("mollieForm.heading")}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t.rich("mollieForm.intro", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      {/* Guide pas-à-pas */}
      <div className="text-xs text-muted-foreground space-y-1.5 bg-background border border-border rounded p-3">
        <p className="font-semibold text-foreground">{t("mollieForm.guideTitle")}</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>
            {t("mollieForm.step1Prefix")}{" "}
            <a
              href="https://my.mollie.com/dashboard/developers/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              {t("mollieForm.step1Link")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            {t.rich("mollieForm.step2", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            {t.rich("mollieForm.step3", {
              code1: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
              code2: (chunks) => <code className="px-1 bg-muted rounded">{chunks}</code>,
            })}
          </li>
        </ol>
      </div>

      {/* Note de sécurité — Mollie n'a pas de clé restreinte */}
      <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3 space-y-1">
        <p className="font-semibold text-amber-900 dark:text-amber-200">{t("mollieForm.noticeTitle")}</p>
        <p className="text-amber-900/80 leading-relaxed">
          {t.rich("mollieForm.noticeBody", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mollie-key">{t("mollieForm.label")}</Label>
        <div className="relative">
          <Input
            id="mollie-key"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="live_…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={pending}
            className="font-mono pr-10"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={visible ? t("mollieForm.hideKey") : t("mollieForm.showKey")}
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
            {error}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("mollieForm.storedEncrypted")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !apiKey.trim()}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("connecting")}
            </>
          ) : (
            t("connect.button")
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
