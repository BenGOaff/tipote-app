"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type GetResp = {
  ok: boolean;
  configured?: boolean;
  provider?: string;
  hasKey?: boolean;
  masked?: string | null;
  error?: string;
};

export default function OpenAIKeyManager() {
  const provider = "openai";
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSave = useMemo(() => configured && apiKey.trim().length >= 10 && !saving, [configured, apiKey, saving]);

  async function refresh() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/user/api-keys?provider=${provider}`, { cache: "no-store" });
      const j = (await r.json()) as GetResp;
      if (!j.ok) throw new Error(j.error || "Erreur");
      setConfigured(Boolean(j.configured));
      setHasKey(Boolean(j.hasKey));
      setMasked(j.masked ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/user/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error || "Impossible d’enregistrer");
      setApiKey("");
      setSuccess("Clé enregistrée ✅");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/user/api-keys`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error || "Impossible de supprimer");
      setSuccess("Clé supprimée ✅");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-800">Clé OpenAI (perso)</p>
          <p className="text-[11px] text-slate-500">
            Stockée chiffrée. Utilisée uniquement pour la génération de contenu (niveau “contenu”).
          </p>
        </div>

        {loading ? (
          <Badge variant="secondary">Chargement…</Badge>
        ) : configured ? (
          hasKey ? (
            <Badge>Enregistrée</Badge>
          ) : (
            <Badge variant="secondary">Non définie</Badge>
          )
        ) : (
          <Badge variant="secondary">Non configuré</Badge>
        )}
      </div>

      {!configured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">Chiffrement non configuré</p>
          <p className="text-[11px] text-amber-800 mt-1">
            Il manque la variable <span className="font-mono">TIPOTE_KEYS_ENCRYPTION_KEY</span> côté serveur.
            La fonctionnalité reste désactivée sans casser l’app.
          </p>
        </div>
      ) : null}

      {hasKey ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="text-sm text-slate-700">{masked ?? "••••••••"}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={deleting || saving || !configured}
          >
            {deleting ? "Suppression…" : "Supprimer"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={!configured || saving || deleting}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500">Astuce : colle ta clé puis “Enregistrer”.</div>
            <Button type="button" size="sm" onClick={onSave} disabled={!canSave}>
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
  );
}
