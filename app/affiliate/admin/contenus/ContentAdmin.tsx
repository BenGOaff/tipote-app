"use client";

// CRUD admin des contenus (articles pour la V1). Liste + ajout / édition /
// suppression, en autonomie. Appelle /affiliate/api/admin/contents.

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ContentItem = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  sort_order: number;
  published: boolean;
};

type Draft = { title: string; body: string; sort_order: number; published: boolean };
const BLANK: Draft = { title: "", body: "", sort_order: 0, published: true };

export function ContentAdmin({ initial, kind = "article" }: { initial: ContentItem[]; kind?: string }) {
  const [items, setItems] = useState<ContentItem[]>(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);

  function startAdd() {
    setDraft({ ...BLANK, sort_order: items.length });
    setEditing("new");
  }
  function startEdit(it: ContentItem) {
    setDraft({ title: it.title ?? "", body: it.body ?? "", sort_order: it.sort_order, published: it.published });
    setEditing(it.id);
  }

  async function refresh() {
    const r = await fetch(`/affiliate/api/admin/contents?kind=${kind}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setItems(r.items as ContentItem[]);
  }

  async function save() {
    if (!draft.title.trim() && !draft.body.trim()) return;
    setBusy(true);
    if (editing === "new") {
      await fetch("/affiliate/api/admin/contents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...draft }),
      });
    } else if (editing) {
      await fetch("/affiliate/api/admin/contents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing, ...draft }),
      });
    }
    await refresh();
    setEditing(null);
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce contenu ?")) return;
    setBusy(true);
    await fetch(`/affiliate/api/admin/contents?id=${id}`, { method: "DELETE" });
    await refresh();
    setBusy(false);
  }

  async function togglePublished(it: ContentItem) {
    setBusy(true);
    await fetch("/affiliate/api/admin/contents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, published: !it.published }),
    });
    await refresh();
    setBusy(false);
  }

  const form = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Titre</Label>
        <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Titre de l'article" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Contenu</Label>
        <Textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          rows={12}
          className="text-sm leading-relaxed"
          placeholder="Le corps de l'article (l'affilié pourra le copier-coller)."
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Ordre</Label>
          <Input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))}
            className="w-20"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))} />
          Publié
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy || (!draft.title.trim() && !draft.body.trim())}>
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} contenu{items.length > 1 ? "s" : ""}</p>
        <Button size="sm" onClick={startAdd} disabled={editing === "new"}>
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter
        </Button>
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
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">{it.body}</p>
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
