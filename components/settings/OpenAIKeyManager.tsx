"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GetResp = {
  ok: boolean;
  configured?: boolean;
  provider?: string;
  hasKey?: boolean;
  masked?: string | null;
  error?: string;
};

type MutResp = {
  ok: boolean;
  error?: string;
};

export default function OpenAIKeyManager() {
  const provider = "openai";

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean>(false);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [masked, setMasked] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/user/api-keys?provider=${provider}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const json = (await res.json()) as GetResp;

      if (!json.ok) {
        setConfigured(false);
        setHasKey(false);
        setMasked(null);
        setError(json.error ?? "Impossible de charger la clé");
        return;
      }

      setConfigured(Boolean(json.configured));
      setHasKey(Boolean(json.hasKey));
      setMasked(json.masked ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const statusBadge = useMemo(() => {
    if (loading) return <Badge variant="secondary">Chargement…</Badge>;
    if (!configured) return <Badge variant="destructive">Chiffrement non configuré</Badge>;
    if (hasKey) return <Badge>Enregistrée</Badge>;
    return <Badge variant="outline">Non renseignée</Badge>;
  }, [configured, hasKey, loading]);

  const onSave = async () => {
    setError(null);
    setSuccess(null);

    const trimmed = apiKey.trim();
    if (trimmed.length < 10) {
      setError("Clé invalide (trop courte)");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/user/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: trimmed }),
      });

      const json = (await res.json()) as MutResp;

      if (!json.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }

      setApiKey("");
      setSuccess("Clé enregistrée ✅");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setError(null);
    setSuccess(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/user/api-keys`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      const json = (await res.json()) as MutResp;

      if (!json.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }

      setSuccess("Clé supprimée ✅");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Clé OpenAI (contenu)</p>
            {statusBadge}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ta clé est chiffrée côté serveur et utilisée uniquement pour la génération de contenus (niveau “Contenu”).
          </p>
        </div>

        {hasKey ? (
          <Button variant="outline" onClick={onDelete} disabled={loading || deleting}>
            {deleting ? "Suppression…" : "Supprimer"}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-600">
            <span className="font-medium">État :</span>{" "}
            {loading
              ? "Chargement…"
              : configured
                ? hasKey
                  ? "Clé enregistrée"
                  : "Aucune clé"
                : "Chiffrement non configuré"}
          </div>

          {masked ? (
            <div className="text-xs text-slate-500">
              <span className="font-medium">Masquée :</span> {masked}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="openai_api_key" className="text-xs">
            Nouvelle clé OpenAI
          </Label>
          <Input
            id="openai_api_key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            disabled={loading || saving || !configured}
          />
          {!configured ? (
            <p className="text-[11px] text-slate-500">
              Le chiffrement n’est pas configuré côté serveur (variable TIPOTE_KEYS_ENCRYPTION_KEY manquante).
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Astuce : colle ta clé complète, puis clique sur “Enregistrer”. Elle ne sera plus affichée ensuite.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onSave} disabled={loading || saving || !configured}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
            Actualiser
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">{error}</div>
        ) : null}

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800">
            {success}
          </div>
        ) : null}
      </div>
    </div>
  );
}
