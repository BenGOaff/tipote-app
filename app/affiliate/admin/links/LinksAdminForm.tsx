"use client";

// app/affiliate/admin/links/LinksAdminForm.tsx
//
// Formulaire d'edition des liens. Le slug est read-only (cle code).
// Le path / sort_order / enabled sont editables. Save = PATCH par row,
// pas de "save global" -> on persiste immediatement chaque ligne pour
// eviter de perdre une edition.

import { useState } from "react";
import { Save, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import type { LinkDestinationRow } from "@/lib/affiliate/linkDestinations";

type Row = LinkDestinationRow & {
  // Etat local d'edition : on edite path/sort/enabled puis on save.
  // dirty = true tant que pas sauvegarde.
  dirty: boolean;
  saving: boolean;
  error: string | null;
};

const SLUG_HINTS: Record<string, string> = {
  tiquiz_main: "Recommande par defaut. Doit etre /part-tiquiz.",
  tiquiz_free: "Compte gratuit a vie.",
  tiquiz_monthly: "Abonnement mensuel 9 EUR.",
  tiquiz_monthly_plus: "Plus mensuel. ATTENTION ordre inverse : /tiquiz-mensuel-plus-part",
  tiquiz_yearly: "Abonnement annuel 90 EUR.",
  tiquiz_yearly_plus: "Plus annuel. ATTENTION ordre inverse : /tiquiz-annuel-plus-part",
};

export function LinksAdminForm({ initial }: { initial: LinkDestinationRow[] }) {
  const [rows, setRows] = useState<Row[]>(
    initial.map((r) => ({ ...r, dirty: false, saving: false, error: null })),
  );

  function update(slug: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.slug === slug ? { ...r, ...patch, dirty: true, error: null } : r)),
    );
  }

  async function save(slug: string) {
    const row = rows.find((r) => r.slug === slug);
    if (!row) return;
    if (!row.path.trim().startsWith("/") && !/^https?:\/\//i.test(row.path.trim())) {
      update(slug, { error: "Le path doit commencer par / ou https://" });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.slug === slug ? { ...r, saving: true, error: null } : r)),
    );
    try {
      const res = await fetch("/affiliate/api/admin/links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: row.slug,
          path: row.path.trim(),
          sort_order: row.sort_order,
          enabled: row.enabled,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.slug === slug
              ? { ...r, saving: false, error: data?.error || "Echec de sauvegarde" }
              : r,
          ),
        );
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.slug === slug ? { ...r, saving: false, dirty: false, error: null } : r,
        ),
      );
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.slug === slug ? { ...r, saving: false, error: "Erreur reseau" } : r,
        ),
      );
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.slug}>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <code className="text-xs font-mono text-muted-foreground">{row.slug}</code>
                {SLUG_HINTS[row.slug] && (
                  <p className="text-xs text-muted-foreground mt-0.5">{SLUG_HINTS[row.slug]}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={(checked) => update(row.slug, { enabled: checked })}
                  />
                  Actif
                </label>
              </div>
            </div>

            <div className="grid sm:grid-cols-[1fr_120px] gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Path</label>
                <Input
                  value={row.path}
                  onChange={(e) => update(row.slug, { path: e.target.value })}
                  placeholder="/part-tiquiz"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Ordre</label>
                <Input
                  type="number"
                  value={row.sort_order}
                  onChange={(e) =>
                    update(row.slug, { sort_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            {row.error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {row.error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              {!row.dirty && !row.saving && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3" /> Sauvegarde
                </span>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => save(row.slug)}
                disabled={!row.dirty || row.saving}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {row.saving ? "..." : "Enregistrer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
