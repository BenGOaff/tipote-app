"use client";

// Bouton "Générer un visuel" + Studio, CÔTÉ TIPOTE. Réutilisable dans le
// composer de posts et l'éditeur d'articles. Différences avec l'affilié :
//   1. Brand kit = identité de marque de l'user (passée par l'hôte).
//   2. Upload → bucket PUBLIC content-images (pour la publication n8n différée).
//   3. Facturation : 1 crédit par génération (image OU carrousel), 0 retouche.
//   4. Format auto adapté au réseau ciblé (post) le cas échéant.
//
// L'hôte fournit `onApplyImage` (image seule) et/ou `onApplyImages` (carrousel)
// pour insérer le(s) visuel(s) là où il faut (meta.images d'un post, <img> dans
// un article…). Le composant ne décide PAS du stockage applicatif, juste de la
// génération + de l'upload storage.

import { useEffect, useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageStudio } from "@/components/visual-studio/ImageStudio";
import { makeContentImageUploader } from "@/lib/visualStudio/uploadToContentImages";
import { emitCreditsUpdated } from "@/lib/credits/client";
import { BRAND_PRESETS } from "@/lib/visualStudio/presets";
import type { BrandKit, StudioResult, StudioFormatId } from "@/lib/visualStudio/types";

/** Visuel stocké, prêt à accrocher à un post (forme meta.images) ou à insérer. */
export type StudioSavedImage = {
  url: string;
  path: string;
  filename: string;
  size: number;
  type: string;
};

function toSaved(r: StudioResult, i?: number): StudioSavedImage {
  const ext = r.blob.type === "image/jpeg" ? "jpg" : "png";
  const suffix = i != null ? `-${String(i + 1).padStart(2, "0")}` : "";
  return {
    url: r.url,
    path: r.storagePath ?? "",
    filename: `studio${suffix}.${ext}`,
    size: r.blob.size,
    type: r.blob.type || "image/png",
  };
}

export function TipoteStudioButton({
  intent,
  contentId,
  formats,
  defaultFormat,
  enableCarousel = true,
  label = "Générer un visuel",
  size = "sm",
  variant = "outline",
  onApplyImage,
  onApplyImages,
}: {
  /** Texte source (post/section) → la copy IA s'adapte à CE contenu. */
  intent?: string;
  /** Id du contenu courant (post/article) → range les visuels sous son dossier. */
  contentId?: string;
  /** Formats proposés (défaut : les 3). Permet d'adapter au réseau. */
  formats?: StudioFormatId[];
  defaultFormat?: StudioFormatId;
  enableCarousel?: boolean;
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  /** Insère UNE image (image seule). */
  onApplyImage?: (img: StudioSavedImage) => void;
  /** Insère PLUSIEURS images (carrousel). Si absent, on retombe sur onApplyImage. */
  onApplyImages?: (imgs: StudioSavedImage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // Brand kit + voix de marque de l'user, chargés à la 1re ouverture (puis
  // mémorisés). Fallback = preset Tipote tant que le fetch n'a pas répondu, pour
  // que le studio soit utilisable même si le profil n'a pas de branding.
  const [brandKit, setBrandKit] = useState<BrandKit>(BRAND_PRESETS.tipote);
  const [brandVoice, setBrandVoice] = useState<string>("");
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [loadingBrand, setLoadingBrand] = useState(false);

  useEffect(() => {
    if (!open || brandLoaded || loadingBrand) return;
    setLoadingBrand(true);
    fetch("/api/visual-studio/brand-kit", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.brand) {
          setBrandKit(j.brand as BrandKit);
          if (typeof j.voiceHint === "string") setBrandVoice(j.voiceHint);
        }
      })
      .catch(() => { /* on garde le preset Tipote par défaut */ })
      .finally(() => {
        setBrandLoaded(true);
        setLoadingBrand(false);
      });
  }, [open, brandLoaded, loadingBrand]);

  // Facturation : 1 crédit / génération. Renvoie false (→ studio annule) si
  // crédits insuffisants, avec le même parcours "recharger" que le reste de l'app.
  async function chargeCredit(kind: "image" | "carousel"): Promise<boolean> {
    try {
      const res = await fetch("/api/visual-studio/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind }),
      });
      if (res.status === 402) {
        toast.error("Crédits IA épuisés", {
          description: "Recharge tes crédits pour générer des visuels.",
          action: { label: "Recharger", onClick: () => { window.location.href = "/settings?tab=billing"; } },
        });
        return false;
      }
      if (!res.ok) {
        toast.error("Génération indisponible", { description: "Réessaie dans un instant." });
        return false;
      }
      emitCreditsUpdated(); // rafraîchit le solde affiché (sidebar/billing)
      return true;
    } catch {
      toast.error("Génération indisponible", { description: "Vérifie ta connexion." });
      return false;
    }
  }

  function handleApply(result: StudioResult) {
    onApplyImage?.(toSaved(result));
  }

  function handleApplyMany(results: StudioResult[]) {
    const saved = results.map((r, i) => toSaved(r, i));
    if (onApplyImages) onApplyImages(saved);
    else if (onApplyImage) saved.forEach((s) => onApplyImage(s));
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        {open && loadingBrand ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4 mr-1.5" />
        )}
        {label}
      </Button>
      <ImageStudio
        open={open}
        onOpenChange={setOpen}
        brandKit={brandKit}
        brandVoice={brandVoice}
        initialIntent={intent}
        formats={formats}
        defaultFormat={defaultFormat}
        enableCarousel={enableCarousel}
        upload={makeContentImageUploader(contentId)}
        onChargeCredit={chargeCredit}
        applyLabel="Insérer"
        onApply={handleApply}
        onApplyMany={handleApplyMany}
      />
    </>
  );
}
