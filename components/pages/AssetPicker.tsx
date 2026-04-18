// components/pages/AssetPicker.tsx
// Modal que l'user voit quand il clique sur une zone photo/illustration.
// Propose trois chemins :
//   1. Restaurer l'élément précédent (si la zone vient d'être "supprimée")
//   2. Choisir une image/animation déjà utilisée sur la même page
//   3. Uploader une nouvelle image
// Objectif : inspire-toi système.io — Marie-Paule retrouve sa photo en 1 clic.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, RotateCcw, Loader2 } from "lucide-react";

export type AssetChoice =
  | { kind: "url"; url: string }
  | { kind: "restore" }
  | { kind: "upload"; file: File };

export function AssetPicker({
  open,
  onOpenChange,
  htmlPreview,
  hasOriginal,
  uploading,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  htmlPreview: string;
  hasOriginal: boolean;
  uploading: boolean;
  onChoose: (choice: AssetChoice) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");

  // Parse all image URLs currently present in the page HTML. We use DOMParser
  // so we don't try to regex our way through HTML.
  const assets = useMemo(() => extractAssets(htmlPreview), [htmlPreview]);

  useEffect(() => {
    if (!open) setFilter("");
  }, [open]);

  const filtered = assets.filter((a) =>
    filter.trim() === "" ? true : a.url.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Choisir une image</DialogTitle>
          <DialogDescription>
            Récupère une image déjà utilisée sur cette page ou importe-en une nouvelle.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {hasOriginal && (
            <Button
              variant="outline"
              onClick={() => onChoose({ kind: "restore" })}
              disabled={uploading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurer l&apos;élément précédent
            </Button>
          )}
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importer une image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChoose({ kind: "upload", file });
              e.target.value = "";
            }}
          />
        </div>

        {assets.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {assets.length} image{assets.length > 1 ? "s" : ""} sur cette page
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto pr-1 max-h-[48vh]">
              {filtered.map((asset) => (
                <button
                  key={asset.url}
                  type="button"
                  onClick={() => onChoose({ kind: "url", url: asset.url })}
                  disabled={uploading}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all bg-muted/40 disabled:opacity-50"
                  title={asset.url}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </>
        )}

        {assets.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Pas encore d&apos;image sur cette page. Importes-en une pour commencer.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Asset = { url: string };

function extractAssets(html: string): Asset[] {
  if (typeof window === "undefined" || !html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const urls = new Set<string>();
    doc.querySelectorAll("img[src]").forEach((img) => {
      const src = (img as HTMLImageElement).getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      urls.add(src);
    });
    // Also pick up background-image on inline styles
    doc.querySelectorAll("[style]").forEach((el) => {
      const style = (el as HTMLElement).getAttribute("style") || "";
      const match = style.match(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/i);
      if (match?.[2] && !match[2].startsWith("data:")) {
        urls.add(match[2]);
      }
    });
    return Array.from(urls).map((url) => ({ url }));
  } catch {
    return [];
  }
}
