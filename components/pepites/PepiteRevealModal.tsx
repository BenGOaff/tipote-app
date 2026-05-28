"use client";

// components/pepites/PepiteRevealModal.tsx
//
// Mobile-game style "card pack opening" reveal. Inspiré du moment
// satisfaisant qu'on a en ouvrant un booster Pokemon ou un chest Clash
// Royale : un sachet arrive scellé, on le touche pour le déchirer, ses
// deux moitiés s'écartent en s'éclipsant, et la carte du jour émerge
// du centre avec un petit overshoot, puis se stabilise pour lecture.
//
// Trois phases :
//   1. "intro"   → le sachet drop-in depuis le bas avec overshoot, idle
//                   avec halo + sparkles, prêt à être tap.
//   2. "opening" → les 2 moitiés du sachet se séparent (haut up + bas
//                   down avec fade), confetti, la carte scale-pop au
//                   centre.
//   3. "front"   → carte stable, contenu lisible (large, aligné à
//                   gauche), CTA + crédit en bas.
//
// Dépendances volontairement minimales : confetti via celebrate(),
// particules via les keyframes Tailwind déjà définies en config (cf.
// `pepite-spark`, `pepite-halo`, `pepite-glow`, `pepite-pop`). Les
// transforms inter-phases passent par des transitions inline pour ne
// pas multiplier les keyframes one-shot.

import * as React from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { celebrate } from "@/lib/celebrate";
import { useTranslations } from "next-intl";

type Pepite = {
  userPepiteId: string;
  pepite: { id: string; title: string; body: string } | null;
};

type Phase = "intro" | "opening" | "front";

const SPARK_COUNT = 18;

// Particules pré-calculées : vecteurs déterministes par render pour ne
// pas faire trembler le layout à chaque paint. 18 sparks s'éparpillent
// en cercle large autour du centre du sachet.
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * Math.PI * 2;
  const radius = 110 + (i % 3) * 22; // 110 / 132 / 154 px
  return {
    sx: Math.cos(angle) * radius,
    sy: Math.sin(angle) * radius,
    delayMs: (i * 50) % 480,
    hue: i % 3 === 0 ? "primary" : i % 3 === 1 ? "amber" : "emerald",
  };
});

function enhanceForDisplay(text: string) {
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    const trimmed = line.trimStart();
    const isArrow = trimmed.startsWith("👉");
    return (
      <p key={idx} className={isArrow ? "font-semibold text-foreground" : ""}>
        {line || <span className="block h-3" />}
      </p>
    );
  });
}

export function PepiteRevealModal({
  item,
  onClose,
}: {
  item: Pepite;
  onClose: () => void;
}) {
  const t = useTranslations("pepites");
  const [phase, setPhase] = React.useState<Phase>("intro");
  const title = item.pepite?.title ?? t("cardDefault");
  const body = item.pepite?.body ?? "";

  // Sur tap : confetti + on lance l'ouverture. Le timing CSS dure 700 ms
  // (flaps qui s'écartent + carte qui scale-pop) ; on déverrouille le
  // CTA et l'état "lisible" à 720 ms pour laisser le temps d'apparaître.
  const handleOpen = React.useCallback(() => {
    if (phase !== "intro") return;
    setPhase("opening");
    celebrate({ intensity: "huge" });
    window.setTimeout(() => setPhase("front"), 720);
  }, [phase]);

  // Lock body scroll while the modal is up.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC ferme ; Enter / Space ouvre quand intro.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.key === "Enter" || e.key === " ") && phase === "intro") {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase, handleOpen]);

  const isOpening = phase !== "intro";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 sm:px-6 bg-background/80 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        // Backdrop ferme seulement quand la carte est révélée — évite
        // de gâcher le reveal par un tap raté pendant l'anim.
        if (phase === "front" && e.target === e.currentTarget) onClose();
      }}
    >
      {/* Kicker au-dessus du sachet/carte. Descendu un peu sur petit
          écran pour ne pas se faire chevaucher par le bouton X. */}
      <div className="absolute top-[6%] sm:top-[10%] left-0 right-0 px-6 text-center pointer-events-none">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
          {t("revealKicker")}
        </p>
        <h2 className="mt-2 text-xl sm:text-2xl font-bold text-foreground line-clamp-2">
          {phase === "front" ? title : t("revealHeadline")}
        </h2>
      </div>

      {/* Fermer — toujours dispo */}
      <button
        type="button"
        aria-label={t("revealClose")}
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-card/80 backdrop-blur border border-border/60 flex items-center justify-center text-foreground hover:bg-card transition-colors z-10"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Sparkle burst — autour du sachet pendant intro/opening */}
      <div className="relative pointer-events-none" aria-hidden>
        <SparkleBurst phase={phase} />
      </div>

      {/* Scène : conteneur qui héberge à la fois le sachet (intro) et la
          carte (front). Largeur ÉLARGIE par rapport à l'ancienne version
          (plus lisible, body en text-base aligné à gauche). */}
      <div
        className="relative pointer-events-auto"
        style={{ perspective: "1400px" }}
      >
        {/* Halo derrière la scène — pulse pendant intro, s'estompe ensuite */}
        {!isOpening && (
          <div
            aria-hidden
            className="absolute inset-0 -m-8 rounded-[32px] bg-gradient-to-br from-primary/30 via-fuchsia-400/20 to-amber-300/30 blur-2xl animate-pepite-halo"
          />
        )}

        {/* Stage avec dimensions FIXES pour que le centre reste stable
            quand on passe de sachet → carte. Largeur élargie. */}
        <div className="relative w-[min(360px,88vw)] h-[min(540px,72vh)] sm:w-[440px] sm:h-[600px]">
          {/* ─────────── CARTE (apparaît à l'ouverture) ───────────
              Rendue derrière le sachet jusqu'au moment où il s'écarte. */}
          <div
            className={
              "absolute inset-0 rounded-[28px] overflow-hidden bg-card border border-border/60 " +
              "shadow-[0_30px_80px_-20px_rgba(93,108,219,0.4)] " +
              "transition-all duration-700 ease-out " +
              (phase === "intro"
                ? "opacity-0 scale-50"
                : phase === "opening"
                ? "opacity-100 scale-105"
                : "opacity-100 scale-100")
            }
            style={{
              transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div className="h-full w-full flex flex-col">
              {/* Header de la carte */}
              <div className="px-6 sm:px-7 pt-6 pb-3 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[11px] uppercase tracking-[0.2em] font-semibold">
                    {t("revealKicker")}
                  </span>
                </div>
                <h3 className="mt-2 text-xl sm:text-2xl font-bold text-foreground leading-snug text-left">
                  {title}
                </h3>
              </div>

              {/* Corps — ÉLARGI, ALIGNÉ À GAUCHE, text-base pour la
                  lisibilité (l'ancienne version était trop étroite et
                  trop petite). scroll si dépasse. */}
              <div className="flex-1 overflow-y-auto px-6 sm:px-7 pb-4 text-[15px] leading-relaxed text-foreground space-y-2 text-left">
                {enhanceForDisplay(body)}
              </div>

              {/* Crédit — discret, en bas, séparé par un fin liseré */}
              <div className="px-6 sm:px-7 pb-5 pt-3 border-t border-border/40">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pépites inspirées par <strong className="font-semibold text-foreground">Jean Rivière</strong> — merci pour l&apos;inspiration 🙏
                </p>
              </div>
            </div>
          </div>

          {/* ─────────── SACHET (deux moitiés qui se séparent) ───────────
              Posé au-dessus de la carte pendant intro. À l'opening, la
              moitié haute fly-up + fade, la moitié basse fly-down + fade,
              révélant la carte qui scale-pop simultanément. */}
          {phase !== "front" && (
            <button
              type="button"
              onClick={() => phase === "intro" && handleOpen()}
              aria-label={t("revealTap")}
              className={
                "absolute inset-0 focus:outline-none " +
                (phase === "intro" ? "animate-pepite-pop cursor-pointer" : "pointer-events-none")
              }
            >
              {/* Moitié haute */}
              <div
                aria-hidden
                className={
                  "absolute left-0 right-0 top-0 h-1/2 overflow-hidden " +
                  "rounded-t-[28px] " +
                  "bg-gradient-to-br from-primary via-indigo-600 to-fuchsia-600 " +
                  "shadow-[0_30px_80px_-20px_rgba(93,108,219,0.6)] " +
                  "transition-all duration-700 ease-out " +
                  (isOpening
                    ? "-translate-y-[110%] opacity-0"
                    : "translate-y-0 opacity-100 animate-pepite-glow")
                }
              >
                <SealedPacketDecorations half="top" />
              </div>

              {/* Moitié basse */}
              <div
                aria-hidden
                className={
                  "absolute left-0 right-0 bottom-0 h-1/2 overflow-hidden " +
                  "rounded-b-[28px] " +
                  "bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-primary " +
                  "shadow-[0_30px_80px_-20px_rgba(190,93,219,0.5)] " +
                  "transition-all duration-700 ease-out " +
                  (isOpening
                    ? "translate-y-[110%] opacity-0"
                    : "translate-y-0 opacity-100 animate-pepite-glow")
                }
              >
                <SealedPacketDecorations half="bottom" />
              </div>

              {/* Ligne de "déchirure" au centre — apparaît juste avant
                  l'ouverture, signal visuel "ici ça va se fendre" */}
              {!isOpening && (
                <div
                  aria-hidden
                  className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px bg-white/40"
                />
              )}

              {/* Badge centré "Touche pour révéler" */}
              {!isOpening && (
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
                  <span className="rounded-full bg-white/90 backdrop-blur px-4 py-2 text-xs font-semibold text-primary shadow-card-hover">
                    {t("revealTap")}
                  </span>
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* CTA — n'apparaît que sur "front" */}
      {phase === "front" && (
        <div className="absolute bottom-[6%] sm:bottom-[8%] left-0 right-0 flex justify-center px-6">
          <Button
            size="lg"
            onClick={onClose}
            className="rounded-full shadow-card-hover"
          >
            {t("revealCta")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Décorations à l'intérieur des moitiés du sachet — sheen diagonal,
// pattern de sparkles, logo Tipote centré sur la moitié haute, libellé
// "Pépite" sur la moitié basse. Les deux moitiés sont visuellement
// continues quand le sachet est scellé.
// ---------------------------------------------------------------------------

function SealedPacketDecorations({ half }: { half: "top" | "bottom" }) {
  return (
    <>
      {/* Sheen diagonal */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.3) 100%)",
        }}
      />
      {/* Pattern sparkles */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 30%, rgba(255,255,255,0.4) 0%, transparent 8%), radial-gradient(circle at 75% 60%, rgba(255,255,255,0.35) 0%, transparent 6%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.3) 0%, transparent 5%)",
        }}
      />
      {/* Contenu central — sur la moitié haute on met le logo + sparkle,
          sur la moitié basse le libellé "Pépite Tipote". Positions
          calculées pour que la composition complète (sachet scellé)
          reste visuellement équilibrée. */}
      {half === "top" ? (
        <div className="absolute inset-0 flex items-end justify-center pb-4 text-white">
          <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
            <Sparkles className="w-10 h-10" />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/80">
            Pépite
          </p>
          <p className="mt-1 text-lg font-bold">Tipote</p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sparkle burst — particules qui partent en cercle autour du sachet
// pendant l'intro + l'opening. Off pendant la lecture (distraction).
// ---------------------------------------------------------------------------

function SparkleBurst({ phase }: { phase: Phase }) {
  if (phase === "front") return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className={
            "absolute w-2 h-2 rounded-full animate-pepite-spark " +
            (s.hue === "primary"
              ? "bg-primary"
              : s.hue === "amber"
              ? "bg-amber-400"
              : "bg-emerald-400")
          }
          style={
            {
              "--sx": `${s.sx}px`,
              "--sy": `${s.sy}px`,
              animationDelay: `${s.delayMs}ms`,
              boxShadow: "0 0 8px currentColor",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
