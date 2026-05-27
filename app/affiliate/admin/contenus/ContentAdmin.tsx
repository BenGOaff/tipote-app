"use client";

// CRUD admin des contenus, par type (article / email…). Liste + ajout /
// édition / suppression / publication, en autonomie. Pour les emails on gère
// aussi le pré-en-tête (stocké dans meta). Bouton d'import des modèles par
// défaut quand la liste est vide.

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff, Download, Type } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArticleEditorModal } from "@/components/create/forms/ArticleEditorModal";
import { sanitizeRichText, stripHtml } from "@/lib/richText";

// Un corps d'article est stocké en HTML (mis en forme via l'éditeur). On
// détecte la présence d'une balise de bloc/inline pour savoir s'il faut le
// rendre comme HTML ou retomber sur du texte brut (rétro-compat).
function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<(p|h[1-4]|strong|b|em|u|ul|ol|li|a|br|div|span)\b[^>]*>/i.test(s);
}

export type ContentItem = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  meta?: Record<string, unknown> | null;
  sort_order: number;
  published: boolean;
};

type Draft = { title: string; preheader: string; body: string; sort_order: number; published: boolean };
const BLANK: Draft = { title: "", preheader: "", body: "", sort_order: 0, published: true };

export function ContentAdmin({
  initial,
  kind = "article",
  seedable = false,
}: {
  initial: ContentItem[];
  kind?: string;
  /** Affiche un bouton "Importer les modèles par défaut" quand la liste est vide. */
  seedable?: boolean;
}) {
  const isEmail = kind === "email";
  const isArticle = kind === "article";
  const [items, setItems] = useState<ContentItem[]>(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  function startAdd() {
    setDraft({ ...BLANK, sort_order: items.length });
    setEditing("new");
  }
  function startEdit(it: ContentItem) {
    setDraft({
      title: it.title ?? "",
      preheader: (it.meta?.preheader as string) ?? "",
      body: it.body ?? "",
      sort_order: it.sort_order,
      published: it.published,
    });
    setEditing(it.id);
  }

  async function refresh() {
    const r = await fetch(`/affiliate/api/admin/contents?kind=${kind}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setItems(r.items as ContentItem[]);
  }

  function payload() {
    return {
      kind,
      title: draft.title,
      body: draft.body,
      sort_order: draft.sort_order,
      published: draft.published,
      ...(isEmail ? { meta: { preheader: draft.preheader } } : {}),
    };
  }

  async function save() {
    if (!draft.title.trim() && !draft.body.trim()) return;
    setBusy(true);
    if (editing === "new") {
      await fetch("/affiliate/api/admin/contents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
    } else if (editing) {
      await fetch("/affiliate/api/admin/contents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing, ...payload() }),
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

  async function seed() {
    setBusy(true);
    await fetch(`/affiliate/api/admin/seed?kind=${kind}`, { method: "POST" });
    await refresh();
    setBusy(false);
  }

  const form = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">{isEmail ? "Objet" : "Titre"}</Label>
        <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder={isEmail ? "Objet de l'email" : "Titre de l'article"} />
      </div>
      {isEmail && (
        <div className="space-y-1">
          <Label className="text-xs">Pré-en-tête (aperçu boîte mail)</Label>
          <Input value={draft.preheader} onChange={(e) => setDraft((d) => ({ ...d, preheader: e.target.value }))} placeholder="Petit texte d'aperçu" />
        </div>
      )}
      {isArticle ? (
        <div className="space-y-1">
          <Label className="text-xs">Contenu</Label>
          {draft.body.trim() ? (
            <div
              className="tipote-quiz-rich rounded-md border bg-muted/20 px-3 py-2 text-sm leading-relaxed max-h-56 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(draft.body) }}
            />
          ) : (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-6 text-sm text-muted-foreground text-center">
              Aucun contenu — clique sur « Éditer le contenu » pour rédiger l&apos;article.
            </div>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => setEditorOpen(true)} className="mt-1">
            <Type className="h-3.5 w-3.5 mr-1.5" />
            Éditer le contenu (mise en forme)
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">Contenu</Label>
          <Textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            rows={12}
            className="text-sm leading-relaxed"
            placeholder={isEmail ? "Corps de l'email. {AFFILIATE_LINK} et {NAME} sont remplacés automatiquement." : "Le corps du contenu (l'affilié pourra le copier-coller)."}
          />
        </div>
      )}
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{items.length} contenu{items.length > 1 ? "s" : ""}</p>
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
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                    {isArticle ? stripHtml(it.body) : it.body}
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

      {isArticle && (
        <ArticleEditorModal
          open={editorOpen}
          onOpenChange={setEditorOpen}
          initialValue={draft.body}
          initialHtml={looksLikeHtml(draft.body) ? draft.body : undefined}
          title="Éditer l'article"
          applyLabel="Valider la mise en forme"
          onApply={({ html }) => setDraft((d) => ({ ...d, body: sanitizeRichText(html) }))}
        />
      )}
    </div>
  );
}
