"use client";

// Admin des VISUELS : upload d'images (pipeline TUS, long terme) + galerie
// gérable (suppression). Chaque visuel = affiliate_contents kind='visual',
// meta.storagePath (re-signé à l'affichage).

import { useState } from "react";
import { Trash2, Loader2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadVisual } from "@/lib/visualStudio/uploadVisual";
import { useDict } from "../../i18n/context";
import { interpolate } from "../../i18n";

export type VisualItem = { id: string; signedUrl?: string; published: boolean };

export function VisualAdmin({
  initial,
  locale = "fr",
}: {
  initial: VisualItem[];
  /** Langue du CONTENU géré. Les visuels textés ne sont pas universels — un
   *  visuel avec du texte FR n'a pas sa place dans la banque PT, d'où la
   *  séparation par locale comme pour les autres kinds. */
  locale?: string;
}) {
  const t = useDict();
  const ta = t.visual_admin;
  const [items, setItems] = useState<VisualItem[]>(initial);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch(`/affiliate/api/admin/contents?kind=visual&locale=${encodeURIComponent(locale)}`)
      .then((x) => x.json())
      .catch(() => null);
    if (r?.ok) setItems(r.items as VisualItem[]);
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const { path } = await uploadVisual(file);
        await fetch("/affiliate/api/admin/contents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "visual", locale, title: file.name, meta: { storagePath: path }, published: true }),
        });
      }
      await refresh();
    } catch {
      /* best effort */
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(ta.confirm_delete)) return;
    setBusy(true);
    await fetch(`/affiliate/api/admin/contents?id=${id}`, { method: "DELETE" });
    await refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {interpolate(items.length > 1 ? ta.count_plural : ta.count_singular, { count: items.length })}
        </p>
        <label className="inline-flex">
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm cursor-pointer ${busy ? "opacity-60 pointer-events-none" : "border-primary bg-primary/10 text-primary hover:bg-primary/15"}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {ta.add_visuals}
          </span>
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ta.empty_state}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.id} className="group relative rounded-md border border-border overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.signedUrl ? <img src={it.signedUrl} alt={ta.visual_alt} className="w-full h-auto block" /> : <div className="aspect-square" />}
              <button
                type="button"
                onClick={() => remove(it.id)}
                disabled={busy}
                className="absolute top-1.5 right-1.5 rounded bg-white/90 p-1 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                title={ta.remove_title}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
