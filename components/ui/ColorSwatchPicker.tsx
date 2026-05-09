"use client";

// ColorSwatchPicker — color picker partagé. Bouton swatch qui ouvre
// un popover style RichTextEdit avec :
//   • palette curée 10 couleurs (mêmes que l'éditeur de texte du quiz
//     pour cohérence)
//   • input hex éditable (#xxxxxx)
//   • input <type="color"> natif pour le custom
//
// Pas de hook lourd ni de lib externe — on reste alignés avec le
// reste de l'app (cf. RichTextEdit qui sert le même pattern pour
// la couleur du texte). Le bouton trigger affiche la couleur courante
// pour que l'user voie en un coup d'œil ce qui est sélectionné.

import { useEffect, useRef, useState } from "react";

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

  // Sync local hex input avec la valeur extérieure quand on rouvre
  // le popover (sinon on garde la saisie en cours).
  useEffect(() => {
    if (!open) setHexInput(value);
  }, [open, value]);

  // Click-out → ferme. On écoute sur document pour attraper les
  // clics hors du popover sans intercepter ceux du bouton.
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
          className="absolute z-30 top-full left-0 mt-1 w-56 rounded-lg border bg-background shadow-lg p-2 space-y-2"
        >
          <div className="grid grid-cols-5 gap-1">
            {SWATCHES.map((s) => (
              <button
                key={s.hex}
                type="button"
                onClick={() => {
                  onChange(s.hex);
                  setOpen(false);
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
          <div className="flex items-center gap-2 pt-1 border-t">
            <input
              type="color"
              value={value || "#ffffff"}
              onChange={(e) => onChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 p-0"
              aria-label="Couleur personnalisée"
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => commitHex(hexInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHex(hexInput);
                  setOpen(false);
                }
              }}
              placeholder="#7ed321"
              spellCheck={false}
              className="flex-1 min-w-0 h-7 rounded border bg-background px-2 text-xs font-mono uppercase"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
