// components/settings/ApiKeysManager.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Provider = "openai" | "claude" | "gemini";

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

const PROVIDERS: Array<{
  key: Provider;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "openai",
    label: "OpenAI",
    hint: "Utilisé pour la génération de contenu (si configuré, prioritaire).",
    placeholder: "sk-...",
  },
  {
    key: "claude",
    label: "Claude",
    hint: "Support UI prêt — génération à activer prochainement.",
    placeholder: "sk-ant-...",
  },
  {
    key: "gemini",
    label: "Gemini",
    hint: "Support UI prêt — génération à activer prochainement.",
    placeholder: "AIza...",
  },
];

function maskKey(key: string) {
  const s = key.trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

export default function ApiKeysManager() {
  const [provider, setProvider] = useState<Provider>("openai");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentProviderMeta = useMemo(
    () => PROVIDERS.find((p) => p.key === provider)!,
    [provider],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/user/api-keys?provider=${provider}`, {
        method: "GET",
      });

      const json = (await res.json().catch(() => null)) as GetResp | null;

      if (!json || !json.ok) {
        setConfigured(false);
        setMasked(null);
        setError(json?.error ?? "Impossible de charger la configuration.");
        return;
      }

      setConfigured(!!json.configured || !!json.hasKey);
      setMasked(json.masked ?? null);
    } catch (e) {
      setConfigured(false);
      setMasked(null);
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    const clean = apiKey.trim();
    if (!clean) {
      setError("La clé est requise.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/user/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: clean }),
      });

      const json = (await res.json().catch(() => null)) as MutResp | null;

      if (!json?.ok) {
        setError(json?.error ?? "Enregistrement impossible");
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

      const json = (await res.json().catch(() => null)) as MutResp | null;

      if (!json?.ok) {
        setError(json?.error ?? "Suppression impossible");
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
      {/* Provider switch */}
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => {
          const isActive = p.key === provider;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setProvider(p.key)}
              className={
                isActive
                  ? "rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-900">{currentProviderMeta.label}</h4>
              {loading ? (
                <Badge variant="secondary">…</Badge>
              ) : configured ? (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Configuré</Badge>
              ) : (
                <Badge variant="secondary">Non configuré</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">{currentProviderMeta.hint}</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading || saving || deleting}>
              Rafraîchir
            </Button>
          </div>
        </div>

        {configured ? (
          <div className="rounded-xl border border-slate-200 p-4 space-y-2">
            <p className="text-xs text-slate-600">
              Clé enregistrée :{" "}
              <span className="font-mono text-slate-900">{masked ?? maskKey("xxxxxxxxxxxxxxxx")}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onDelete} disabled={deleting || saving}>
                {deleting ? "Suppression…" : "Supprimer"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="apiKeyInput">
                Clé API {currentProviderMeta.label}
              </Label>
              <Input
                id="apiKeyInput"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentProviderMeta.placeholder}
                type="password"
              />
              <p className="text-[11px] text-slate-500">
                Elle est chiffrée côté serveur. Tipote l’utilise uniquement pour générer tes contenus.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={onSave} disabled={saving || loading}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        )}

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
