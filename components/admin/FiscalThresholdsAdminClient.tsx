"use client";

// Page admin — édition des seuils fiscaux. Une ligne par seuil avec
// lecture / édition inline. Pas de tableau ultra-flexible : c'est
// un usage rare (1-2 fois par an quand la loi de finances change).
// L'objectif est qu'en cas d'alerte du cron, Béné puisse arriver,
// modifier la valeur en 30 secondes et fermer l'onglet.

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Save,
  X,
  Plus,
  AlertCircle,
} from "lucide-react";

interface Threshold {
  id: string;
  country: string;
  fiscal_year: number;
  category: string;
  base_value: number;
  major_value: number | null;
  source_url: string | null;
  effective_from: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function useCategoryLabel() {
  const t = useTranslations("adminFiscal");
  return (c: string): string => {
    const labels: Record<string, string> = {
      vat_franchise_vente: t("catVatFranchiseVente"),
      vat_franchise_services_bic: t("catVatFranchiseServicesBic"),
      vat_franchise_services_bnc: t("catVatFranchiseServicesBnc"),
    };
    return labels[c] ?? c;
  };
}

export default function FiscalThresholdsAdminClient() {
  const t = useTranslations("adminFiscal");
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/fiscal-thresholds");
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; thresholds?: Threshold[]; error?: string }
        | null;
      if (json?.ok && Array.isArray(json.thresholds)) {
        setThresholds(json.thresholds);
      } else {
        toast({
          title: t("loadError"),
          description: json?.error,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  // Group par pays + année pour faire 1 card par "lot annuel"
  const grouped = new Map<string, Threshold[]>();
  for (const row of thresholds) {
    const key = `${row.country} ${row.fiscal_year}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  return (
    <div className="space-y-4 max-w-[1100px]">
      <Card className="p-5 space-y-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-900 dark:text-blue-200 text-sm">
              {t("introTitle")}
            </p>
            <p className="text-xs text-blue-900/80 leading-relaxed">
              {t("introBody")}
            </p>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t("recordedThresholds")}</h2>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-2" />
          {t("addThreshold")}
        </Button>
      </div>

      {showCreate ? (
        <CreateForm
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await reload();
            toast({ title: t("thresholdAdded") });
          }}
        />
      ) : null}

      {loading ? (
        <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </Card>
      ) : thresholds.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t("emptyState")}
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([key, items]) => (
          <Card key={key} className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {key}
            </h3>
            <div className="divide-y border rounded-md">
              {items.map((row) => (
                <ThresholdRow
                  key={row.id}
                  threshold={row}
                  editing={editingId === row.id}
                  onEdit={() => setEditingId(row.id)}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await reload();
                    toast({ title: t("thresholdUpdated") });
                  }}
                />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Une ligne (lecture + édition inline)
 * ────────────────────────────────────────────────────────────────── */

function ThresholdRow({
  threshold,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  threshold: Threshold;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("adminFiscal");
  const categoryLabel = useCategoryLabel();
  const [base, setBase] = useState(String(threshold.base_value));
  const [major, setMajor] = useState(threshold.major_value !== null ? String(threshold.major_value) : "");
  const [sourceUrl, setSourceUrl] = useState(threshold.source_url ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(threshold.effective_from);
  const [notes, setNotes] = useState(threshold.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBase(String(threshold.base_value));
    setMajor(threshold.major_value !== null ? String(threshold.major_value) : "");
    setSourceUrl(threshold.source_url ?? "");
    setEffectiveFrom(threshold.effective_from);
    setNotes(threshold.notes ?? "");
    setError(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/fiscal-thresholds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: threshold.id,
            base_value: parseFloat(base),
            major_value: major.trim() ? parseFloat(major) : null,
            source_url: sourceUrl.trim() || null,
            effective_from: effectiveFrom,
            notes: notes.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!json?.ok) {
          setError(json?.error ?? t("error"));
          return;
        }
        await onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("networkError"));
      }
    });
  }

  if (!editing) {
    return (
      <div className="px-4 py-3 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-medium text-sm">{categoryLabel(threshold.category)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">
              {new Intl.NumberFormat("fr-FR").format(threshold.base_value)} €
            </span>
            {threshold.major_value !== null ? (
              <>
                {" — "}{t("majorThresholdInline")}{" : "}
                <span className="font-semibold text-foreground">
                  {new Intl.NumberFormat("fr-FR").format(threshold.major_value)} €
                </span>
              </>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("inEffectSince", { date: threshold.effective_from })}
            {threshold.source_url ? (
              <>
                {" — "}
                <a
                  href={threshold.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-0.5"
                >
                  {t("officialSource")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            ) : null}
          </div>
          {threshold.notes ? (
            <p className="text-xs text-muted-foreground italic">{threshold.notes}</p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          {t("edit")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="px-4 py-3 space-y-3 bg-muted/20">
      <div className="font-medium text-sm">{categoryLabel(threshold.category)}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`base-${threshold.id}`}>
            {t("baseValue")}
          </Label>
          <Input
            id={`base-${threshold.id}`}
            inputMode="numeric"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`major-${threshold.id}`}>
            {t("majorThreshold")}
          </Label>
          <Input
            id={`major-${threshold.id}`}
            inputMode="numeric"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`url-${threshold.id}`}>
            {t("sourceUrl")}
          </Label>
          <Input
            id={`url-${threshold.id}`}
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={pending}
            placeholder="https://www.service-public.fr/…"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`from-${threshold.id}`}>
            {t("effectiveFrom")}
          </Label>
          <Input
            id={`from-${threshold.id}`}
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            disabled={pending}
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor={`notes-${threshold.id}`}>
          {t("notesOptional")}
        </Label>
        <Input
          id={`notes-${threshold.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          placeholder={t("notesPlaceholder")}
        />
      </div>
      {error ? (
        <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            onCancel();
          }}
          disabled={pending}
        >
          <X className="h-3.5 w-3.5 mr-1.5" />
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Form pour créer un nouveau seuil
 * ────────────────────────────────────────────────────────────────── */

function CreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const t = useTranslations("adminFiscal");
  const [country, setCountry] = useState("FR");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getUTCFullYear() + 1));
  const [category, setCategory] = useState("vat_franchise_vente");
  const [base, setBase] = useState("");
  const [major, setMajor] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(`${new Date().getUTCFullYear() + 1}-01-01`);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/fiscal-thresholds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: country.trim().toUpperCase(),
            fiscal_year: parseInt(fiscalYear, 10),
            category: category.trim(),
            base_value: parseFloat(base),
            major_value: major.trim() ? parseFloat(major) : null,
            source_url: sourceUrl.trim() || null,
            effective_from: effectiveFrom,
            notes: notes.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!json?.ok) {
          setError(json?.error ?? t("error"));
          return;
        }
        await onCreated();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("networkError"));
      }
    });
  }

  return (
    <Card className="p-5 space-y-4 bg-muted/20">
      <h3 className="font-semibold">{t("newThreshold")}</h3>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("country")}</Label>
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={pending}
            maxLength={2}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("fiscalYear")}</Label>
          <Input
            type="number"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">{t("categoryCodeKey")}</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={pending}
            required
            placeholder="ex: vat_franchise_vente"
          />
          <p className="text-[11px] text-muted-foreground">
            {t("categoryHint")}{" "}
            <code>vat_franchise_vente</code>, <code>vat_franchise_services_bic</code>,{" "}
            <code>vat_franchise_services_bnc</code>.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("baseValue")}</Label>
          <Input
            inputMode="numeric"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("majorThresholdOptional")}</Label>
          <Input
            inputMode="numeric"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">{t("sourceUrl")}</Label>
          <Input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={pending}
            placeholder="https://www.service-public.fr/…"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("effectiveFrom")}</Label>
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("notes")}</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
          />
        </div>
        {error ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2 sm:col-span-2">
            {error}
          </div>
        ) : null}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("create")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
