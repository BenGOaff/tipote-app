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
import { useDict } from "../../i18n/context";
import { interpolate } from "../../i18n";

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
  locale = "fr",
  seedable = false,
}: {
  initial: ContentItem[];
  kind?: string;
  /** Langue du CONTENU géré (pas l'UI). Filtre les fetches et est utilisée
   *  comme locale de tout nouveau contenu créé depuis cet onglet. */
  locale?: string;
  /** Affiche un bouton "Importer les modèles par défaut" quand la liste est vide. */
  seedable?: boolean;
}) {
  const t = useDict();
  const ta = t.content_admin;
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
    const r = await fetch(`/affiliate/api/admin/contents?kind=${kind}&locale=${encodeURIComponent(locale)}`)
      .then((x) => x.json())
      .catch(() => null);
    if (r?.ok) setItems(r.items as ContentItem[]);
  }

  // Locale n'est inclus qu'à la CRÉATION (POST). Sur PATCH on ne touche
  // pas à la locale du row — l'édition se fait toujours dans la langue
  // de l'onglet courant, et changer la locale d'un row existant doit
  // rester une action volontaire (pas un effet de bord d'un switch UI).
  function payload(includeLocale: boolean) {
    return {
      kind,
      title: draft.title,
      body: draft.body,
      sort_order: draft.sort_order,
      published: draft.published,
      ...(includeLocale ? { locale } : {}),
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
        body: JSON.stringify(payload(true)),
      });
    } else if (editing) {
      await fetch("/affiliate/api/admin/contents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing, ...payload(false) }),
      });
    }
    await refresh();
    setEditing(null);
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm(ta.confirm_delete)) return;
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
    await fetch(`/affiliate/api/admin/seed?kind=${kind}&locale=${encodeURIComponent(locale)}`, { method: "POST" });
    await refresh();
    setBusy(false);
  }

  const form = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">{isEmail ? ta.label_subject : ta.label_title}</Label>
        <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder={isEmail ? ta.placeholder_email_subject : ta.placeholder_article_title} />
      </div>
      {isEmail && (
        <div className="space-y-1">
          <Label className="text-xs">{ta.label_preheader}</Label>
          <Input value={draft.preheader} onChange={(e) => setDraft((d) => ({ ...d, preheader: e.target.value }))} placeholder={ta.placeholder_preheader} />
        </div>
      )}
      {isArticle ? (
        <div className="space-y-1">
          <Label className="text-xs">{ta.label_content}</Label>
          {draft.body.trim() ? (
            <div
              className="tipote-quiz-rich rounded-md border bg-muted/20 px-3 py-2 text-sm leading-relaxed max-h-56 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(draft.body) }}
            />
          ) : (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-6 text-sm text-muted-foreground text-center">
              {ta.empty_content}
            </div>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => setEditorOpen(true)} className="mt-1">
            <Type className="h-3.5 w-3.5 mr-1.5" />
            {ta.edit_content_button}
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">{ta.label_content}</Label>
          <Textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            rows={12}
            className="text-sm leading-relaxed"
            placeholder={isEmail ? ta.placeholder_email_body : ta.placeholder_article_body}
          />
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs">{ta.label_order}</Label>
          <Input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))}
            className="w-20"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))} />
          {ta.label_published}
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy || (!draft.title.trim() && !draft.body.trim())}>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {ta.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          {ta.cancel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {interpolate(items.length > 1 ? ta.count_plural : ta.count_singular, { count: items.length })}
        </p>
        <div className="flex gap-2">
          {seedable && items.length === 0 && locale === "fr" && (
            <Button size="sm" variant="outline" onClick={seed} disabled={busy}>
              <Download className="h-4 w-4 mr-1.5" />
              {ta.import_defaults}
            </Button>
          )}
          <Button size="sm" onClick={startAdd} disabled={editing === "new"}>
            <Plus className="h-4 w-4 mr-1.5" />
            {ta.add}
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
                  <p className="font-medium truncate">{it.title || ta.untitled}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                    {isArticle ? stripHtml(it.body) : it.body}
                  </p>
                  {!it.published && <span className="text-[11px] text-amber-600">{ta.draft}</span>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => togglePublished(it)} disabled={busy} title={it.published ? ta.unpublish : ta.publish}>
                    {it.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(it)} title={ta.edit}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(it.id)} disabled={busy} title={ta.remove} className="text-muted-foreground hover:text-destructive">
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
          title={ta.article_modal_title}
          applyLabel={ta.article_modal_apply}
          onApply={({ html }) => setDraft((d) => ({ ...d, body: sanitizeRichText(html) }))}
        />
      )}
    </div>
  );
}
