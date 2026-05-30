"use client";

// Gestionnaire de liens d'affiliation éditable : l'affilié voit la liste
// (par défaut + ses ajouts), peut ajouter / modifier / supprimer un lien.
// Persistance auto (sans bouton "enregistrer global") dans promo_overrides
// sous la clé `links:custom:items` (valeur = JSON), via /affiliate/api/promo.

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AffiliateLinkCopy from "./AffiliateLinkCopy";
import { buildAffiliateLink, affiliateOrigin } from "@/lib/affiliate/links";
import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";

export type LinkItem = { label: string; description: string; path: string };

const STORE_KEY = "links:custom:items";

async function persist(items: LinkItem[]) {
  try {
    await fetch("/affiliate/api/promo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: STORE_KEY, value: JSON.stringify(items) }),
    });
  } catch {
    /* best effort */
  }
}

export function LinksManager({
  sa,
  locale,
  defaults,
  saved,
  sectionTitle,
}: {
  sa: string;
  /** Langue d'interface de l'affilié → choisit le domaine (FR=.fr, EN=.blog). */
  locale: string;
  defaults: LinkItem[];
  saved: LinkItem[] | null;
  sectionTitle: string;
}) {
  const t = useDict();
  const tl = t.links_manager;
  // Domaine du marché de l'affilié (pour le placeholder + la construction d'URL).
  const marketOrigin = affiliateOrigin(locale);
  const marketHost = marketOrigin.replace(/^https?:\/\//, "");
  // Si l'affilié a déjà personnalisé sa liste, on la prend ; sinon les défauts.
  const [items, setItems] = useState<LinkItem[]>(saved ?? defaults);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<LinkItem>({ label: "", description: "", path: "" });

  function commit(next: LinkItem[]) {
    setItems(next);
    void persist(next);
  }

  function startAdd() {
    setDraft({ label: "", description: "", path: "" });
    setEditing(items.length); // index virtuel = nouvel élément
  }
  function startEdit(i: number) {
    setDraft(items[i]);
    setEditing(i);
  }
  function cancel() {
    setEditing(null);
  }
  function save() {
    const clean: LinkItem = {
      label: draft.label.trim(),
      description: draft.description.trim(),
      path: draft.path.trim(),
    };
    if (!clean.label || !clean.path) return; // libellé + destination obligatoires
    const next = [...items];
    if (editing !== null && editing < items.length) next[editing] = clean;
    else next.push(clean);
    setEditing(null);
    commit(next);
  }
  function remove(i: number) {
    commit(items.filter((_, idx) => idx !== i));
  }

  const editForm = (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-xs">{tl.label_field}</Label>
        <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder={tl.label_field_placeholder} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{tl.description_field}</Label>
        <Input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder={tl.description_field_placeholder} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{tl.destination_field}</Label>
        <Input value={draft.path} onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))} placeholder={interpolate(tl.destination_placeholder, { host: marketHost })} />
        <p className="text-[11px] text-muted-foreground">{interpolate(tl.destination_hint, { host: marketHost, sa })}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!draft.label.trim() || !draft.path.trim()}>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {tl.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          {tl.cancel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{sectionTitle}</h2>
        <Button size="sm" variant="outline" onClick={startAdd}>
          <Plus className="h-4 w-4 mr-1.5" />
          {tl.add_link}
        </Button>
      </div>

      {items.map((item, i) => (
        <Card key={`${item.path}-${i}`}>
          <CardContent className="pt-5 space-y-3">
            {editing === i ? (
              editForm
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(i)} title={tl.edit_title}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(i)} title={tl.remove_title} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <AffiliateLinkCopy url={buildAffiliateLink(locale, item.path, sa)} />
              </>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Formulaire d'ajout (index virtuel = items.length) */}
      {editing === items.length && (
        <Card className="border-primary/30">
          <CardContent className="pt-5">{editForm}</CardContent>
        </Card>
      )}
    </div>
  );
}
