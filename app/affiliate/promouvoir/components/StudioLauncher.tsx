"use client";

// Bouton "Générer un visuel" + studio, réutilisable. On le pose À CÔTÉ d'un
// contenu (post, plus tard quiz/article) en lui passant le texte source via
// `intent` → la copy générée s'adapte à CE contenu, pas à un sujet au hasard.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageStudio } from "@/components/visual-studio/ImageStudio";
import { BRAND_PRESETS } from "@/lib/visualStudio/presets";
import { uploadVisual } from "@/lib/visualStudio/uploadVisual";
import type { StudioResult } from "@/lib/visualStudio/types";

export function StudioLauncher({
  intent,
  label,
}: {
  /** Texte source (ex: le post) — pré-remplit le sujet IA. */
  intent?: string;
  label: string;
}) {
  const t = useTranslations("visualStudio");
  const [open, setOpen] = useState(false);

  function handleApply(result: StudioResult) {
    // Téléchargement local via le blob (fiable même si l'URL est distante).
    const href = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `visuel-tiquiz-${result.format.replace(":", "x")}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
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
        applyLabel={t("download")}
        upload={uploadVisual}
        onApply={handleApply}
      />
    </>
  );
}
