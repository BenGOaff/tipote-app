// lib/celebrate.ts
// Zero-dep confetti — fired on milestones (first quiz published, first
// lead captured, etc.) without pulling a 30 KB library.
//
// USAGE
// ─────
//   import { celebrate } from "@/lib/celebrate";
//   celebrate();                       // burst from viewport centre
//   celebrate({ origin: "top-right" }); // useful from a save toast
//   celebrate({ intensity: "subtle" }); // fewer particles for everyday wins
//
// The helper is SSR-safe (no-op when window is undefined). Each call
// spawns a fresh DOM container that auto-removes after the animation,
// so multiple rapid calls don't pile up forever.

export type CelebrateOptions = {
  /** Where the burst originates from. Default: "center". */
  origin?: "center" | "top-right" | "bottom-center";
  /** Intensity tier — picks a particle count + spread. */
  intensity?: "subtle" | "normal" | "huge";
};

const COLORS = [
  "#5D6CDB", // primary blue
  "#C1FF6F", // accent green
  "#F472B6", // pink
  "#FBBF24", // amber
  "#34D399", // emerald
  "#A78BFA", // violet
];

const INTENSITY_PRESETS = {
  subtle: { count: 14, spread: 60, durationMs: 900 },
  normal: { count: 32, spread: 120, durationMs: 1400 },
  huge: { count: 70, spread: 220, durationMs: 1800 },
} as const;

/**
 * Fire a confetti burst. Call from any client component (button onClick,
 * post-save callback, etc.). Safe to call repeatedly — each call gets its
 * own self-cleaning DOM container.
 */
export function celebrate(options: CelebrateOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // Respect users' system-level "reduced motion" preference — confetti
  // is delight, not function. Keep accessibility intact.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const { origin = "center", intensity = "normal" } = options;
  const preset = INTENSITY_PRESETS[intensity];

  // Resolve origin to viewport coordinates.
  let originX = window.innerWidth / 2;
  let originY = window.innerHeight / 2;
  if (origin === "top-right") {
    originX = window.innerWidth - 80;
    originY = 80;
  } else if (origin === "bottom-center") {
    originX = window.innerWidth / 2;
    originY = window.innerHeight - 80;
  }

  // Single container per burst so cleanup is trivial.
  const container = document.createElement("div");
  container.setAttribute("data-celebrate", "");
  container.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;";
  document.body.appendChild(container);

  for (let i = 0; i < preset.count; i++) {
    const piece = document.createElement("span");
    const angle = (Math.PI * 2 * i) / preset.count + (Math.random() - 0.5) * 0.4;
    const distance = preset.spread + Math.random() * preset.spread;
    const dx = Math.cos(angle) * distance;
    // Add gravity bias so particles fall slightly faster than they rise.
    const dy = Math.sin(angle) * distance + 60 + Math.random() * 60;
    const rotate = Math.random() * 720 - 360;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const isCircle = Math.random() > 0.5;

    piece.style.cssText = `
      position:absolute;
      left:${originX}px;
      top:${originY}px;
      width:${isCircle ? 8 : 6}px;
      height:${isCircle ? 8 : 12}px;
      background:${color};
      border-radius:${isCircle ? "50%" : "1px"};
      transform:translate(-50%,-50%) rotate(0deg);
      opacity:1;
      transition:transform ${preset.durationMs}ms cubic-bezier(0.22,1,0.36,1),opacity ${preset.durationMs}ms ease-out;
    `;
    container.appendChild(piece);

    // Trigger transition on next frame so the browser registers the
    // initial state before applying the animation.
    requestAnimationFrame(() => {
      piece.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${rotate}deg)`;
      piece.style.opacity = "0";
    });
  }

  // Self-clean after the animation finishes.
  setTimeout(() => {
    container.remove();
  }, preset.durationMs + 100);
}
