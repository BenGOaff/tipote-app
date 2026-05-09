"use client";

// ColorSwatchPicker — popover de sélection de couleur "à la systeme.io" :
//   • carré HSV (saturation × valeur) + slider de teinte (`HexColorPicker`
//     de react-colorful — ~3kb gzipped)
//   • input hex éditable
//   • palette curée 10 swatches (cohérente avec celle de RichTextEdit)
//
// Composant générique réutilisable dans tout l'app (apparence popquiz,
// éditeur de quiz, branding, etc.). Trigger = un swatch de la couleur
// courante qui ouvre le popover ; clic-out ferme.

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

const SWATCHES: Array<{ hex: string; label: string }> = [
  { hex: "#000000", label: "Noir" },
  { hex: "#ffffff", label: "Blanc" },
  { hex: "#6b7280", label: "Gris" },
  { hex: "#ef4444", label: "Rouge" },
  { hex: "#f59e0b", label: "Orange" },
  { hex: "#10b981", label: "Vert" },
  { hex: "#3b82f6", label: "Bleu" },
  { hex: "#8b5cf6", label: "Violet" },
  { hex: "#ec4899", label: "Rose" },
  { hex: "#0ea5e9", label: "Cyan" },
];

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /** Texte d'accessibilité du bouton swatch. */
  label?: string;
  /** Désactive le picker. */
  disabled?: boolean;
}

export function ColorSwatchPicker({ value, onChange, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) setHexInput(value);
  }, [open, value]);

  // Click-out → ferme.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!popRef.current || !btnRef.current) return;
      const t = e.target as Node;
      if (popRef.current.contains(t) || btnRef.current.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commitHex(raw: string) {
    const v = raw.trim();
    if (HEX_RE.test(v)) {
      const normalized =
        v.length === 4
          ? "#" + v.slice(1).split("").map((c) => c + c).join("")
          : v.toLowerCase();
      onChange(normalized);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="size-9 rounded-md border border-border/60 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow transition"
        style={{ backgroundColor: value || "#ffffff" }}
        aria-label={label ?? "Choisir une couleur"}
        title={value}
      />
      {open && !disabled ? (
        <div
          ref={popRef}
          className="absolute z-30 top-full left-0 mt-1 w-60 rounded-lg border bg-background shadow-lg p-2.5 space-y-2.5"
        >
          {/* HSV square + hue slider — composant react-colorful.
              On force la largeur full pour que le carré HSV remplisse
              le popover proprement. */}
          <div className="rcw">
            <HexColorPicker
              color={value || "#ffffff"}
              onChange={onChange}
            />
          </div>

          {/* Hex input + palette */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#</span>
            <input
              type="text"
              value={hexInput.startsWith("#") ? hexInput.slice(1) : hexInput}
              onChange={(e) => setHexInput("#" + e.target.value.replace(/^#/, ""))}
              onBlur={() => commitHex(hexInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHex(hexInput);
                }
              }}
              placeholder="7ed321"
              spellCheck={false}
              className="flex-1 min-w-0 h-7 rounded border bg-background px-2 text-xs font-mono uppercase"
            />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Couleurs enregistrées
            </div>
            <div className="grid grid-cols-5 gap-1">
              {SWATCHES.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  onClick={() => {
                    onChange(s.hex);
                  }}
                  title={s.label}
                  className={`w-8 h-8 rounded-md border transition-transform hover:scale-110 ${
                    value.toLowerCase() === s.hex
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border/60"
                  }`}
                  style={{ backgroundColor: s.hex }}
                  aria-label={s.label}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {/* Override la largeur par défaut de react-colorful (200px) pour
          coller au popover et donner un peu plus de surface au carré. */}
      <style jsx global>{`
        .rcw .react-colorful {
          width: 100%;
          height: 140px;
        }
        .rcw .react-colorful__saturation {
          border-radius: 6px 6px 0 0;
        }
        .rcw .react-colorful__hue,
        .rcw .react-colorful__alpha {
          height: 14px;
          border-radius: 0 0 6px 6px;
        }
      `}</style>
    </div>
  );
}
