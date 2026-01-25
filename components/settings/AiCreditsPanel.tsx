"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCcw, Sparkles } from "lucide-react";

type Balance = {
  total_remaining: number;
  total_purchased: number;
  total_consumed: number;
};

export default function AiCreditsPanel() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/credits/balance", { method: "GET" });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Impossible de charger les crédits.");
      }

      setBalance(json.balance as Balance);
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue");
      setBalance(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const remaining = balance?.total_remaining ?? 0;

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-2">Crédits IA</h3>
            <p className="text-muted-foreground text-sm">
              Toutes les générations utilisent les modèles IA de Tipote™ (plus de clés API personnelles).
              <br />
              1 génération = 1 crédit.
            </p>
          </div>

          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Rafraîchir">
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Solde actuel</p>
            <p className="text-sm text-muted-foreground">
              {loading ? "Chargement…" : error ? "Erreur" : "Crédits disponibles pour générer"}
            </p>
          </div>

          {error ? (
            <Badge variant="destructive">Erreur</Badge>
          ) : loading ? (
            <Badge variant="outline">…</Badge>
          ) : remaining > 0 ? (
            <Badge className="bg-success text-success-foreground">OK</Badge>
          ) : (
            <Badge variant="outline">0 crédit</Badge>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="text-3xl font-bold tabular-nums">
            {loading ? "—" : remaining}
            <span className="text-base font-medium text-muted-foreground ml-2">crédits</span>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <Link href="/pricing">Recharger / Upgrade</Link>
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive mt-3">{error}</p> : null}

        {!loading && !error && balance ? (
          <p className="text-xs text-muted-foreground mt-3">
            Achetés : <span className="tabular-nums">{balance.total_purchased}</span> • Consommés :{" "}
            <span className="tabular-nums">{balance.total_consumed}</span>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
