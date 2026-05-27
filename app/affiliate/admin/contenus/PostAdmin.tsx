"use client";

// Éditeur admin des POSTS réseaux : jour, thème, hook, chemin du visuel par
// défaut, et les 3 captions (Instagram / LinkedIn / X). Stocké dans
// affiliate_contents kind='post' : title=dayLabel, meta={theme,hook,visualPath,posts}.

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const NETWORKS = [
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
] as const;

export type PostItem = {
  id: string;
  title: string | null;
  meta?: Record<string, unknown> | null;
  sort_order: number;
  published: boolean;
};

type Caption = { network: string; caption: string };
type Draft = {
  dayLabel: string;
  theme: string;
  hook: string;
  visualPath: string;
  captions: Record<string, string>;
  sort_order: number;
  published: boolean;
};
const BLANK: Draft = { dayLabel: "", theme: "", hook: "", visualPath: "", captions: {}, sort_order: 0, published: true };

function toDraft(it: PostItem): Draft {
  const m = (it.meta ?? {}) as Record<string, unknown>;
  const caps: Record<string, string> = {};
  for (const c of (Array.isArray(m.posts) ? m.posts : []) as Caption[]) {
    if (c && typeof c.network === "string") caps[c.network] = String(c.caption ?? "");
  }
  return {
    dayLabel: it.title ?? "",
    theme: String(m.theme ?? ""),
    hook: String(m.hook ?? ""),
    visualPath: String(m.visualPath ?? ""),
    captions: caps,
    sort_order: it.sort_order,
    published: it.published,
  };
}

export function PostAdmin({ initial, seedable = false }: { initial: PostItem[]; seedable?: boolean }) {
  const [items, setItems] = useState<PostItem[]>(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);

  function startAdd() {
    setDraft({ ...BLANK, sort_order: items.length });
    setEditing("new");
  }
  function startEdit(it: PostItem) {
    setDraft(toDraft(it));
    setEditing(it.id);
  }

  async function refresh() {
    const r = await fetch(`/affiliate/api/admin/contents?kind=post`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setItems(r.items as PostItem[]);
  }

  function payload() {
    return {
      kind: "post",
      title: draft.dayLabel,
      body: "",
      sort_order: draft.sort_order,
      published: draft.published,
      meta: {
        theme: draft.theme,
        hook: draft.hook,
        visualPath: draft.visualPath,
        posts: NETWORKS.filter((n) => (draft.captions[n.id] ?? "").trim()).map((n) => ({
          network: n.id,
          caption: draft.captions[n.id],
        })),
      },
    };
  }

  async function save() {
    if (!draft.dayLabel.trim()) return;
    setBusy(true);
    if (editing === "new") {
      await fetch("/affiliate/api/admin/contents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
    } else if (editing) {
      await fetch("/affiliate/api/admin/contents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing, ...payload() }) });
    }
    await refresh();
    setEditing(null);
    setBusy(false);
  }
  async function remove(id: string) {
    if (!confirm("Supprimer ce post ?")) return;
    setBusy(true);
    await fetch(`/affiliate/api/admin/contents?id=${id}`, { method: "DELETE" });
    await refresh();
    setBusy(false);
  }
  async function togglePublished(it: PostItem) {
    setBusy(true);
    await fetch("/affiliate/api/admin/contents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, published: !it.published }) });
    await refresh();
    setBusy(false);
  }
  async function seed() {
    setBusy(true);
    await fetch(`/affiliate/api/admin/seed?kind=post`, { method: "POST" });
    await refresh();
    setBusy(false);
  }

  const form = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Jour / libellé</Label>
          <Input value={draft.dayLabel} onChange={(e) => setDraft((d) => ({ ...d, dayLabel: e.target.value }))} placeholder="J1 — Annonce" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Thème</Label>
          <Input value={draft.theme} onChange={(e) => setDraft((d) => ({ ...d, theme: e.target.value }))} placeholder="Annonce — présenter l'outil" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hook (accroche courte)</Label>
        <Input value={draft.hook} onChange={(e) => setDraft((d) => ({ ...d, hook: e.target.value }))} placeholder="C'est live." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Chemin du visuel par défaut (optionnel)</Label>
        <Input value={draft.visualPath} onChange={(e) => setDraft((d) => ({ ...d, visualPath: e.target.value }))} placeholder="/affiliate-assets/visuels/singles/single-01.png" />
      </div>
      {NETWORKS.map((n) => (
        <div key={n.id} className="space-y-1">
          <Label className="text-xs">{n.label}</Label>
          <Textarea
            value={draft.captions[n.id] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, captions: { ...d.captions, [n.id]: e.target.value } }))}
            rows={5}
            className="text-sm leading-relaxed"
            placeholder={`Caption ${n.label}. {AFFILIATE_LINK} est remplacé automatiquement.`}
          />
        </div>
      ))}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Ordre</Label>
          <Input type="number" value={draft.sort_order} onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))} className="w-20" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))} />
          Publié
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy || !draft.dayLabel.trim()}>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          Enregistrer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Annuler
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{items.length} post{items.length > 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          {seedable && items.length === 0 && (
            <Button size="sm" variant="outline" onClick={seed} disabled={busy}>
              <Download className="h-4 w-4 mr-1.5" />
              Importer les modèles par défaut
            </Button>
          )}
          <Button size="sm" onClick={startAdd} disabled={editing === "new"}>
            <Plus className="h-4 w-4 mr-1.5" />
            Ajouter
          </Button>
        </div>
      </div>

      {editing === "new" && (
        <Card className="border-primary/30">
          <CardContent className="pt-5">{form}</CardContent>
        </Card>
      )}

      {items.map((it) => (
        <Card key={it.id} className={it.published ? "" : "opacity-70"}>
          <CardContent className="pt-5">
            {editing === it.id ? (
              form
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{it.title || "(sans titre)"}</p>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {String((it.meta as Record<string, unknown>)?.hook ?? "")}
                  </p>
                  {!it.published && <span className="text-[11px] text-amber-600">Brouillon</span>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => togglePublished(it)} disabled={busy} title={it.published ? "Dépublier" : "Publier"}>
                    {it.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(it)} title="Modifier">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(it.id)} disabled={busy} title="Supprimer" className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
