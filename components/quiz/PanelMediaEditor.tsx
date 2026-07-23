// components/quiz/PanelMediaEditor.tsx
"use client";

// Editeur du visuel du panneau decoratif (disposition "colonnes"), fidele
// au mockup valide : toggle "Meme visuel sur toutes les pages" (ON par
// defaut), controle segmente Motif/Couleur/Degrade/Image, et le picker
// correspondant (pastilles couleur, pastilles degrade, motifs avec apercu
// canvas + couleur de motif, upload image / GIF). Ecrit dans un objet
// PanelMediaConfig transmis via onChange. Quand le toggle est OFF, on edite
// la page selectionnee (per-page).

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { GifPickerButton } from "@/components/quiz/GifPicker";
import { drawMotif } from "@/lib/panelMotif";
import {
  PANEL_MOTIFS,
  QUIZ_GRADIENTS,
  defaultPanelMediaItem,
  type PanelMediaConfig,
  type PanelMediaItem,
  type PanelMediaType,
  type PanelMotifKey,
} from "@/lib/quizBranding";

// Palette de couleurs proposees (fermee, ZERO CSS libre).
const PANEL_COLORS = [
  "#5D6CDB", "#0EA5E9", "#10B981", "#F59E0B", "#FB7185", "#8B5CF6",
  "#334155", "#0F172A", "#E11D48", "#0D9488", "#7C3AED", "#DB2777",
];

type PageOption = { key: string; label: string };

function MotifSwatch({ motif, color }: { motif: PanelMotifKey; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const raf = requestAnimationFrame(() => drawMotif(cv, motif, color));
    return () => cancelAnimationFrame(raf);
  }, [motif, color]);
  return <canvas ref={ref} className="w-full h-full block" aria-hidden />;
}

export function PanelMediaEditor({
  config,
  onChange,
  brandColor,
  pages,
  t,
  uploadImage,
}: {
  config: PanelMediaConfig | null;
  onChange: (next: PanelMediaConfig | null) => void;
  brandColor: string;
  pages: PageOption[];
  t: (key: string, values?: Record<string, string | number>) => string;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const sameAll = !(config?.perPage === true);
  const [pageKey, setPageKey] = useState<string>(pages[0]?.key ?? "intro");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // S'assure que la page selectionnee existe toujours (ex. suppression d'une
  // question). Sinon retombe sur la premiere page dispo.
  useEffect(() => {
    if (!pages.some((p) => p.key === pageKey) && pages[0]) setPageKey(pages[0].key);
  }, [pages, pageKey]);

  const item: PanelMediaItem = sameAll
    ? config?.global ?? defaultPanelMediaItem(brandColor)
    : config?.pages?.[pageKey] ?? defaultPanelMediaItem(brandColor);

  const motifColor = item.motifColor || brandColor;

  function commit(nextItem: PanelMediaItem) {
    const base: PanelMediaConfig = config ? { ...config } : {};
    if (sameAll) {
      onChange({ ...base, perPage: false, global: nextItem });
    } else {
      onChange({ ...base, perPage: true, pages: { ...(base.pages ?? {}), [pageKey]: nextItem } });
    }
  }

  function patchItem(patch: Partial<PanelMediaItem>) {
    commit({ ...item, ...patch });
  }

  function setSameAll(v: boolean) {
    // ON = un seul visuel (global). OFF = per-page.
    if (v) {
      onChange({ ...(config ?? {}), perPage: false, global: config?.global ?? item });
    } else {
      onChange({
        ...(config ?? {}),
        perPage: true,
        pages: { ...(config?.pages ?? {}), [pageKey]: config?.pages?.[pageKey] ?? item },
      });
    }
  }

  const types: [PanelMediaType, string][] = [
    ["motif", t("designPanelTypeMotif")],
    ["color", t("designPanelTypeColor")],
    ["gradient", t("designPanelTypeGradient")],
    ["image", t("designPanelTypeImage")],
  ];

  async function onFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) patchItem({ type: "image", imageUrl: url });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-2.5">
      {/* Toggle "meme visuel partout" */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <span className="relative inline-block h-5 w-9 shrink-0">
          <input
            type="checkbox"
            checked={sameAll}
            onChange={(e) => setSameAll(e.target.checked)}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
          <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="text-xs font-medium">{t("designPanelSameAll")}</span>
      </label>
      <p className="text-[10px] text-muted-foreground">
        {sameAll ? t("designPanelSameAllOn") : t("designPanelSameAllOff")}
      </p>

      {/* Selecteur de page quand per-page */}
      {!sameAll && (
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">{t("designPanelPage")}</label>
          <select
            value={pageKey}
            onChange={(e) => setPageKey(e.target.value)}
            className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background font-medium cursor-pointer"
          >
            {pages.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Type de visuel */}
      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">{t("designPanelType")}</label>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {types.map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => patchItem({ type: val })}
              className={`rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${item.type === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Picker couleur */}
      {item.type === "color" && (
        <div className="grid grid-cols-6 gap-1.5">
          {PANEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patchItem({ color: c })}
              className={`aspect-square rounded-md border-2 transition-all ${item.color === c ? "border-foreground ring-2 ring-primary" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      )}

      {/* Picker degrade */}
      {item.type === "gradient" && (
        <div className="grid grid-cols-4 gap-1.5">
          {Object.entries(QUIZ_GRADIENTS).map(([key, css]) => (
            <button
              key={key}
              type="button"
              onClick={() => patchItem({ gradient: key as keyof typeof QUIZ_GRADIENTS })}
              className={`aspect-square rounded-md border-2 transition-all ${item.gradient === key ? "border-foreground ring-2 ring-primary" : "border-transparent"}`}
              style={{ background: css }}
              aria-label={key}
            />
          ))}
        </div>
      )}

      {/* Picker motif (couleur + motifs) */}
      {item.type === "motif" && (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1.5">
            {PANEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patchItem({ motifColor: c })}
                className={`aspect-square rounded-md border-2 transition-all ${motifColor === c ? "border-foreground ring-2 ring-primary" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {PANEL_MOTIFS.map((mo) => (
              <button
                key={mo}
                type="button"
                onClick={() => patchItem({ motif: mo })}
                className={`relative h-12 overflow-hidden rounded-md border-2 transition-all ${(item.motif ?? "mesh") === mo ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
              >
                <MotifSwatch motif={mo} color={motifColor} />
                <span className="absolute left-1 bottom-0.5 text-[9px] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
                  {t(`designPanelMotif_${mo}`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Picker image */}
      {item.type === "image" && (
        <div className="space-y-2">
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-24 w-full rounded-lg object-cover bg-muted/40" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,image/gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/40 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("designPanelImageAdd")}
            </button>
            <GifPickerButton label={t("designPanelImageGif")} onPick={(url) => patchItem({ type: "image", imageUrl: url })} />
            {item.imageUrl && (
              <button type="button" onClick={() => patchItem({ imageUrl: undefined })} className="text-[11px] text-muted-foreground hover:text-primary hover:underline">
                {t("designPanelImageRemove")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
