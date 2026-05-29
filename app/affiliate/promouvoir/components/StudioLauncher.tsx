"use client";

// Bouton "Générer un visuel" + studio, réutilisable. On le pose À CÔTÉ d'un
// contenu (post, plus tard quiz/article) en lui passant le texte source via
// `intent` → la copy générée s'adapte à CE contenu, pas à un sujet au hasard.

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageStudio } from "@/components/visual-studio/ImageStudio";
import { BRAND_PRESETS } from "@/lib/visualStudio/presets";
import { uploadVisual } from "@/lib/visualStudio/uploadVisual";
import type { StudioResult } from "@/lib/visualStudio/types";

export function StudioLauncher({
  intent,
  label,
  onSaved,
  onSavedMany,
}: {
  /** Texte source (ex: le post) — pré-remplit le sujet IA. */
  intent?: string;
  label: string;
  /** Appelé quand un visuel est généré + stocké : (chemin long terme, URL
   *  signée pour affichage immédiat). L'hôte persiste le chemin + affiche. */
  onSaved?: (storagePath: string, url: string) => void;
  /** Idem pour un CARROUSEL : toutes les slides d'un coup (ordre conservé) →
   *  l'hôte persiste la liste en UNE fois (évite les races sur l'état). */
  onSavedMany?: (items: { path: string; url: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function download(result: StudioResult, index?: number) {
    const href = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    const suffix = index != null ? `-${String(index + 1).padStart(2, "0")}` : "";
    a.href = href;
    a.download = `visuel-tiquiz-${result.format.replace(":", "x")}${suffix}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  function handleApply(result: StudioResult) {
    // Le visuel est stocké (TUS long terme) → on remonte le CHEMIN à l'hôte
    // pour qu'il l'accroche au post (l'URL signée n'est valable que 2 h).
    if (onSaved && result.storagePath) {
      onSaved(result.storagePath, result.url);
      return;
    }
    download(result); // fallback : téléchargement local
  }

  function handleApplyMany(results: StudioResult[]) {
    const stored = results.filter((r) => r.storagePath).map((r) => ({ path: r.storagePath as string, url: r.url }));
    if (onSavedMany && stored.length) {
      onSavedMany(stored);
      return;
    }
    if (onSaved && stored.length) {
      // Pas de handler "many" → on remonte chaque slide (l'hôte gère la liste).
      stored.forEach((s) => onSaved(s.path, s.url));
      return;
    }
    results.forEach((r, i) => download(r, i)); // fallback : téléchargement de toutes les slides
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Wand2 className="h-4 w-4 mr-1.5" />
        {label}
      </Button>
      <ImageStudio
        open={open}
        onOpenChange={setOpen}
        brandKit={BRAND_PRESETS.tiquiz}
        initialIntent={intent}
        applyLabel="Attacher au post"
        upload={uploadVisual}
        onApply={handleApply}
        onApplyMany={handleApplyMany}
      />
    </>
  );
}
