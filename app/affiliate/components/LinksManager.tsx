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

export type LinkItem = { label: string; description: string; path: string };

const STORE_KEY = "links:custom:items";

function buildUrl(path: string, sa: string): string {
  const p = path.trim();
  if (!p) return "";
  const abs = /^https?:\/\//i.test(p) ? p : `https://www.tipote.fr${p.startsWith("/") ? "" : "/"}${p}`;
  return `${abs}${abs.includes("?") ? "&" : "?"}sa=${sa}`;
}

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
  defaults,
  saved,
  sectionTitle,
}: {
  sa: string;
  defaults: LinkItem[];
  saved: LinkItem[] | null;
  sectionTitle: string;
}) {
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
        <Label className="text-xs">Libellé</Label>
        <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Ex. Tiquiz essai gratuit" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description (optionnel)</Label>
        <Input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="À quoi sert ce lien" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Destination</Label>
        <Input value={draft.path} onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))} placeholder="/part-tiquiz-gratuit ou https://www.tipote.blog/article" />
        <p className="text-[11px] text-muted-foreground">Un chemin tipote.fr (ex. /commande) ou une URL complète. Ton {`?sa=${sa}`} est ajouté automatiquement.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!draft.label.trim() || !draft.path.trim()}>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          Enregistrer
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Annuler
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
          Ajouter un lien
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
                    <Button size="sm" variant="ghost" onClick={() => startEdit(i)} title="Modifier">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(i)} title="Supprimer" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <AffiliateLinkCopy url={buildUrl(item.path, sa)} />
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
