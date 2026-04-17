// components/pages/LayoutPanel.tsx
// Responsive layout editor for capture pages.
// Two tabs (Mobile / Desktop), each with a visual preset picker + collapsible
// advanced controls. Changes are pushed up via onChange with debounced save.

"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Smartphone, Monitor, SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  DEFAULT_LAYOUT,
  DESKTOP_PRESET_META,
  MOBILE_PRESET_META,
  parseLayoutConfig,
  type LayoutConfig,
  type LayoutPreset,
  type ScreenLayout,
  type PhotoFit,
  type PhotoRatio,
  type FormWidth,
} from "@/lib/pageLayout";

type Props = {
  value: unknown;
  onChange: (next: LayoutConfig) => void;
};

const RATIOS: PhotoRatio[] = ["auto", "16:9", "4:3", "1:1", "9:16"];
const FITS: PhotoFit[] = ["cover", "contain"];
const WIDTHS: FormWidth[] = ["narrow", "normal", "wide"];

export default function LayoutPanel({ value, onChange }: Props) {
  const t = useTranslations("pageBuilder.layout");
  const tPresets = useTranslations("pageBuilder.layout.presets");
  const cfg = useMemo(() => parseLayoutConfig(value), [value]);

  const [tab, setTab] = useState<"mobile" | "desktop">("mobile");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const screen: ScreenLayout = tab === "mobile" ? cfg.mobile : cfg.desktop;
  const presets = tab === "mobile" ? MOBILE_PRESET_META : DESKTOP_PRESET_META;

  const updateScreen = (patch: Partial<ScreenLayout>) => {
    const next: LayoutConfig = {
      ...cfg,
      [tab]: { ...screen, ...patch },
    };
    onChange(next);
  };

  const reset = () => onChange(DEFAULT_LAYOUT);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-white/60 flex items-center gap-1">
          <LayoutIcon /> {t("title")}
        </label>
        <button
          type="button"
          onClick={reset}
          className="text-[10px] text-white/40 hover:text-white/70 underline"
          title={t("reset")}
        >
          {t("reset")}
        </button>
      </div>

      {/* Screen toggle: Mobile / Desktop */}
      <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-lg">
        <button
          type="button"
          onClick={() => setTab("mobile")}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "mobile" ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" /> {t("screenMobile")}
        </button>
        <button
          type="button"
          onClick={() => setTab("desktop")}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "desktop" ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <Monitor className="w-3.5 h-3.5" /> {t("screenDesktop")}
        </button>
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-2 gap-2">
        {presets.map(p => {
          const active = screen.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => updateScreen({ preset: p.id })}
              className={`group rounded-lg border p-2 text-left transition-all ${
                active
                  ? "border-primary bg-primary/20 ring-1 ring-primary/40"
                  : "border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25"
              }`}
              title={tPresets(p.id)}
            >
              <div className="flex items-center justify-center h-10 mb-1">
                <svg
                  viewBox="0 0 32 32"
                  className={`w-8 h-8 ${active ? "text-white" : "text-white/70 group-hover:text-white"}`}
                  dangerouslySetInnerHTML={{ __html: p.thumb }}
                />
              </div>
              <div className={`text-[10px] leading-tight text-center ${active ? "text-white font-medium" : "text-white/60"}`}>
                {tPresets(p.id)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Advanced */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(v => !v)}
        className="w-full flex items-center justify-between py-1.5 px-2 rounded-md text-[11px] font-medium text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3" /> {t("advanced")}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
      </button>

      {advancedOpen && (
        <div className="space-y-3 pl-1 pr-1 pb-1">
          {/* Photo ratio */}
          <AdvancedRow label={t("photoRatio")}>
            <SegmentedControl
              options={RATIOS.map(r => ({ value: r, label: r === "auto" ? t("auto") : r }))}
              value={screen.photoRatio ?? "auto"}
              onChange={(v) => updateScreen({ photoRatio: v as PhotoRatio })}
            />
          </AdvancedRow>

          {/* Photo fit */}
          <AdvancedRow label={t("photoFit")}>
            <SegmentedControl
              options={FITS.map(f => ({ value: f, label: t(`fit.${f}`) }))}
              value={screen.photoFit ?? "cover"}
              onChange={(v) => updateScreen({ photoFit: v as PhotoFit })}
            />
          </AdvancedRow>

          {/* Form width */}
          <AdvancedRow label={t("formWidth")}>
            <SegmentedControl
              options={WIDTHS.map(w => ({ value: w, label: t(`width.${w}`) }))}
              value={screen.formWidth ?? "normal"}
              onChange={(v) => updateScreen({ formWidth: v as FormWidth })}
            />
          </AdvancedRow>

          {/* Gap */}
          <AdvancedRow label={`${t("gap")} (${screen.gap ?? 36}px)`}>
            <input
              type="range"
              min={0}
              max={96}
              step={4}
              value={screen.gap ?? 36}
              onChange={(e) => updateScreen({ gap: parseInt(e.target.value, 10) })}
              className="w-full accent-primary"
            />
          </AdvancedRow>

          {/* Overlay (only meaningful for photo-bg) */}
          {screen.preset === "photo-bg" && (
            <AdvancedRow label={`${t("overlay")} (${screen.overlayOpacity ?? 40}%)`}>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={screen.overlayOpacity ?? 40}
                onChange={(e) => updateScreen({ overlayOpacity: parseInt(e.target.value, 10) })}
                className="w-full accent-primary"
              />
            </AdvancedRow>
          )}
        </div>
      )}

      <p className="text-[10px] text-white/40 leading-snug">{t("hint")}</p>
    </div>
  );
}

// ── Internals ─────────────────────────────────────────────────────────────

function AdvancedRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-white/50 mb-1">{label}</div>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 bg-white/5 p-0.5 rounded-md">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-1.5 py-1 text-[10px] rounded transition-colors ${
            value === o.value ? "bg-white/20 text-white font-medium" : "text-white/50 hover:text-white/80"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LayoutIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
      <rect x="1" y="2" width="14" height="5" rx="1" opacity="0.4" />
      <rect x="1" y="9" width="6" height="5" rx="1" />
      <rect x="9" y="9" width="6" height="5" rx="1" />
    </svg>
  );
}

export function isCapturePage(p: { page_type?: string; template_kind?: string }): boolean {
  return p.page_type === "capture" || p.template_kind === "capture";
}

// Re-export so PageBuilder doesn't import from two places.
export type { LayoutConfig, LayoutPreset };
