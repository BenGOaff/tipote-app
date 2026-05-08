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

function formatRelative(iso: string | null): string {
  if (!iso) return "jamais";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "à l'instant";
  if (ms < 3_600_000) return `il y a ${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `il y a ${Math.floor(ms / 3_600_000)} h`;
  return `il y a ${Math.floor(ms / 86_400_000)} j`;
}

export default function ComptaConnections() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncPending, startSyncTransition] = useTransition();
  const [showStripeForm, setShowStripeForm] = useState(false);
  const [showPaypalForm, setShowPaypalForm] = useState(false);
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
            title: success > 0 ? `${success} connexion(s) à jour` : "Aucune nouvelle transaction",
            description:
              json.failed && json.failed > 0
                ? `${json.failed} connexion(s) en erreur — vérifie ci-dessous`
                : undefined,
          });
          await reload();
        } else {
          toast({ title: "Erreur de synchronisation", variant: "destructive" });
        }
      } catch (e) {
        toast({
          title: "Erreur",
          description: e instanceof Error ? e.message : "Inconnue",
          variant: "destructive",
        });
      }
    });
  }

  async function disconnect(id: string) {
    if (
      !confirm(
        "Déconnecter cette source ? Tu pourras te reconnecter quand tu veux ; tes transactions déjà importées restent consultables.",
      )
    )
      return;
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
        toast({ title: "Déconnecté" });
        await reload();
      } else {
        toast({ title: "Erreur", description: json?.error, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Inconnue",
        variant: "destructive",
      });
    }
  }

  const stripeConn = connections.find((c) => c.provider === "stripe" && !c.disabled_at);
  const paypalConn = connections.find((c) => c.provider === "paypal" && !c.disabled_at);
  const activeCount = connections.filter((c) => !c.disabled_at).length;

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de tes connexions…
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Plug className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg">Mes connexions</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Connecte tes outils de paiement pour que Tipote suive
              automatiquement tes encaissements. <strong>On
              synchronise une fois par jour</strong> ; clique sur le
              bouton ci-dessous pour forcer une mise à jour immédiate.
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
            Synchroniser maintenant
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
                title: "Stripe connecté",
                description: "Synchronisation initiale en cours (24 mois). Ça peut prendre quelques secondes.",
              });
            }}
            onCancel={() => setShowStripeForm(false)}
          />
        ) : (
          <ConnectButton
            providerKey="stripe"
            label="Connecter Stripe"
            description="Récupère automatiquement tes encaissements (jusqu'à 24 mois d'historique)."
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
                title: "PayPal connecté",
                description: "Synchronisation initiale en cours (24 mois). Ça peut prendre quelques minutes.",
              });
            }}
            onCancel={() => setShowPaypalForm(false)}
          />
        ) : (
          <ConnectButton
            providerKey="paypal"
            label="Connecter PayPal"
            description="Récupère automatiquement tes encaissements PayPal (jusqu'à 24 mois d'historique)."
            onClick={() => setShowPaypalForm(true)}
          />
        )}

        {/* Mollie — arrive plus tard */}
        <DisabledConnectButton providerKey="mollie" label="Mollie" />
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
                  <span>Synchronisation initiale en cours…</span>
                </>
              ) : hasError ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-destructive">Erreur — voir détails ci-dessous</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  <span>Synchronisé {formatRelative(connection.last_sync_at)}</span>
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
          Déconnecter
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
  const color = PROVIDER_COLORS[providerKey] ?? "bg-muted";
  return (
    <div className="w-full rounded-lg border border-dashed border-border p-4 flex items-center gap-3 opacity-50">
      <div className={`${color} text-white rounded p-1.5 shrink-0`}>
        <Plug className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">Bientôt disponible.</p>
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
          setError(json?.error ?? "Erreur");
          return;
        }
        if (json.livemode === false) {
          toast({
            title: "Clé Stripe en mode test détectée",
            description:
              "Tu as collé une clé `rk_test_…` ou `sk_test_…`. Pour la prod, utilise une clé `rk_live_…`.",
          });
        }
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">Connecter Stripe</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          On a besoin d&apos;une <strong>Restricted Key</strong> en
          lecture seule. Tu gardes le contrôle total — tu peux la
          révoquer à tout moment depuis ton dashboard Stripe.
        </p>
      </div>

      {/* Guide pas-à-pas */}
      <div className="text-xs text-muted-foreground space-y-1.5 bg-background border border-border rounded p-3">
        <p className="font-semibold text-foreground">Comment créer la clé en 30 secondes :</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>
            Ouvre{" "}
            <a
              href="https://dashboard.stripe.com/apikeys/create"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              dashboard.stripe.com → Restricted keys → Create
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            Nom : <code className="px-1 bg-muted rounded">Tipote – Compta (lecture)</code>
          </li>
          <li>
            Permissions <strong>Read</strong> sur :{" "}
            <code className="px-1 bg-muted rounded">Charges</code>,{" "}
            <code className="px-1 bg-muted rounded">Customers</code>,{" "}
            <code className="px-1 bg-muted rounded">Balance</code>. Tout le reste : None.
          </li>
          <li>
            Copie la clé (commence par <code className="px-1 bg-muted rounded">rk_live_</code>) et
            colle-la ci-dessous.
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stripe-key">Restricted Key Stripe</Label>
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
            aria-label={visible ? "Masquer la clé" : "Afficher la clé"}
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">
          Stockée chiffrée (AES-256) côté Tipote. Jamais affichée en clair après cette saisie.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !key.trim()}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connexion…
            </>
          ) : (
            "Connecter"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Annuler
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
          setError(json?.error ?? "Erreur");
          return;
        }
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">Connecter PayPal</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          PayPal demande une <strong>app développeur</strong> avec une
          paire (Client ID, Secret). Tu gardes le contrôle — tu peux
          révoquer l&apos;app à tout moment depuis ton dashboard
          developer.paypal.com.
        </p>
      </div>

      {/* Guide pas-à-pas */}
      <div className="text-xs text-muted-foreground space-y-1.5 bg-background border border-border rounded p-3">
        <p className="font-semibold text-foreground">Comment créer l&apos;app en 1 minute :</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>
            Ouvre{" "}
            <a
              href="https://developer.paypal.com/dashboard/applications/live"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              developer.paypal.com → Apps & Credentials → Create App
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            Nom : <code className="px-1 bg-muted rounded">Tipote – Compta (lecture)</code>
            {" — "}Type : <code className="px-1 bg-muted rounded">Merchant</code>
          </li>
          <li>
            Sur la page de l&apos;app : <strong>scroll vers le bas</strong> jusqu&apos;à
            <em>Live API features</em>, et <strong>active</strong> la case{" "}
            <code className="px-1 bg-muted rounded">Transaction Search</code>.
            Sans ça, on ne peut pas lire l&apos;historique. Clique <em>Save</em>.
          </li>
          <li>
            Copie le <strong>Client ID</strong> et le <strong>Secret</strong> (tu dois cliquer
            <em> Show</em> pour révéler le secret) et colle-les ci-dessous.
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paypal-mode">Mode</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as "live" | "sandbox")}>
          <SelectTrigger id="paypal-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Live (production — vraies ventes)</SelectItem>
            <SelectItem value="sandbox">Sandbox (test — pour valider l&apos;intégration)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === "sandbox"
            ? "Mode test : les ventes ne seront pas réelles, utile pour valider la connexion."
            : "Mode production : Tipote synchronisera tes vraies ventes."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paypal-client-id">Client ID</Label>
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
        <Label htmlFor="paypal-secret">Secret</Label>
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
            aria-label={secretVisible ? "Masquer le secret" : "Afficher le secret"}
          >
            {secretVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Stocké chiffré (AES-256) côté Tipote. Jamais affiché en clair après cette saisie.
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
              Connexion…
            </>
          ) : (
            "Connecter"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Annuler
        </Button>
      </div>
    </form>
  );
}
