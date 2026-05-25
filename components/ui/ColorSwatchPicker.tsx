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
import { createPortal } from "react-dom";
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
  /** Palettes utilisateur, surfacées en plus des swatches curés.
   *  Si vide / non fourni : pas de section "Mes palettes" affichée. */
  userPalettes?: Array<{ id: string; name: string; colors: string[] }>;
  /** Optionnel : label du label "Mes palettes" — défaut FR.
   *  i18n géré par le parent (le picker reste agnostique-locale). */
  userPalettesLabel?: string;
}

export function ColorSwatchPicker({ value, onChange, label, disabled, userPalettes, userPalettesLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  // Position du popover, rendu en portal (position: fixed) pour ne JAMAIS
  // être coupé par un parent en overflow:hidden (cards, toolbars…).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const POP_W = 240; // largeur w-60

  function computePos() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8)),
    };
  }

  // Reposition sur scroll/resize tant que le popover est ouvert.
  // (Effet = uniquement des listeners ; le setState a lieu dans le callback.)
  useEffect(() => {
    if (!open) return;
    const place = () => setPos(computePos());
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

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

  // Les interactions DANS le popover ne doivent NI fermer le picker (via le
  // listener click-out ci-dessus) NI blurer l'éditeur parent (texte Fabric).
  // Le popover étant rendu en portal (hors de l'arbre DOM du parent), un
  // handler React onMouseDown ne suffit pas de façon fiable → on attache un
  // listener NATIF sur l'élément : il stoppe la propagation du mousedown
  // (→ `onDoc` sur document ne se déclenche pas) et empêche le blur
  // (preventDefault), sauf sur les inputs (le champ hex doit pouvoir focus).
  useEffect(() => {
    if (!open) return;
    const el = popRef.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
    };
    el.addEventListener("mousedown", onDown);
    return () => el.removeEventListener("mousedown", onDown);
  }, [open, pos]);

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
        onClick={() => {
          const next = !open;
          if (next) {
            setHexInput(value);
            setPos(computePos());
          }
          setOpen(next);
        }}
        className="size-9 rounded-md border border-border/60 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow transition"
        style={{ backgroundColor: value || "#ffffff" }}
        aria-label={label ?? "Choisir une couleur"}
        title={value}
      />
      {open && !disabled && pos ? createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, pointerEvents: "auto" }}
          className="z-[100] w-60 rounded-lg border bg-background shadow-lg p-2.5 space-y-2.5"
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

          {userPalettes && userPalettes.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {userPalettesLabel ?? "Mes palettes"}
              </div>
              <div className="space-y-1.5">
                {userPalettes.map((p) => (
                  p.colors.length > 0 ? (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground truncate max-w-[80px]" title={p.name}>
                        {p.name}
                      </span>
                      <div className="flex gap-1">
                        {p.colors.map((c, i) => (
                          <button
                            key={`${p.id}-${i}`}
                            type="button"
                            onClick={() => onChange(c)}
                            title={c}
                            className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                              value.toLowerCase() === c.toLowerCase()
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-border/60"
                            }`}
                            style={{ backgroundColor: c }}
                            aria-label={c}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null
                ))}
              </div>
            </div>
          ) : null}

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
        </div>,
        document.body,
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
