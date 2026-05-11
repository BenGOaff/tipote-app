// components/widgets/SocialShareOverlay.tsx
"use client";

import { useEffect, useState } from "react";

type ShareConfig = {
  platforms: string[];
  display_mode: string;
  button_style: string;
  button_size: string;
  show_labels: boolean;
  share_url: string | null;
  share_text: string | null;
  share_hashtags: string | null;
  color_mode: string;
  custom_color: string | null;
};

// SVG paths for each platform. Real-vendor monochrome icons render cleaner
// than the typographic glyphs (f / 𝕏 / in / wa…) that used to be hardcoded
// here and looked "stuck on" the buttons. They scale with the button size
// without aliasing. All paths sourced from the public Simple Icons set.
function PlatformIcon({ slug, size }: { slug: string; size: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor" } as const;
  switch (slug) {
    case "facebook":
      return (
        <svg {...common} aria-hidden>
          <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...common} aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common} aria-hidden>
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common} aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.885 3.488" />
        </svg>
      );
    case "pinterest":
      return (
        <svg {...common} aria-hidden>
          <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.756-1.378l-.749 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.987C24.007 5.367 18.641.001 12.017.001z" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common} aria-hidden>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case "reddit":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
        </svg>
      );
    case "email":
      return (
        <svg {...common} aria-hidden>
          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
        </svg>
      );
    default:
      return null;
  }
}

const PLATFORMS: Record<string, { name: string; color: string; share: (u: string, t: string, h: string) => string }> = {
  facebook: { name: "Facebook", color: "#1877F2", share: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  twitter: { name: "X", color: "#000000", share: (u, t, h) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}${t ? "&text=" + encodeURIComponent(t) : ""}${h ? "&hashtags=" + encodeURIComponent(h) : ""}` },
  linkedin: { name: "LinkedIn", color: "#0A66C2", share: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  whatsapp: { name: "WhatsApp", color: "#25D366", share: (u, t) => `https://api.whatsapp.com/send?text=${encodeURIComponent((t ? t + " " : "") + u)}` },
  pinterest: { name: "Pinterest", color: "#E60023", share: (u, t) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(u)}&description=${encodeURIComponent(t || "")}` },
  telegram: { name: "Telegram", color: "#26A5E4", share: (u, t) => `https://telegram.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t || "")}` },
  reddit: { name: "Reddit", color: "#FF4500", share: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t || document.title)}` },
  email: { name: "Email", color: "#525252", share: (u, t) => `mailto:?subject=${encodeURIComponent(t || document.title)}&body=${encodeURIComponent(u)}` },
};

export default function SocialShareOverlay({ widgetId }: { widgetId: string }) {
  const [cfg, setCfg] = useState<ShareConfig | null>(null);

  useEffect(() => {
    fetch(`/api/widgets/share/${widgetId}/public`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setCfg(d.widget); })
      .catch(() => {});
  }, [widgetId]);

  if (!cfg) return null;

  const pageUrl = cfg.share_url || (typeof window !== "undefined" ? window.location.href : "");
  const text = cfg.share_text || "";
  const hashtags = cfg.share_hashtags || "";

  // Defaults pulled down a notch — Béné feedback 2026-05-11: 40px square
  // buttons stacked across 8 platforms with logo glyphs (f, X, in, wa, tg…)
  // felt loud and amateur. Smaller default + real-vendor SVG icons + softer
  // hover give the row a "polished accessory" feel that fits next to a
  // result card without competing with the content.
  const sizes = { sm: 28, md: 32, lg: 40 };
  const sz = sizes[cfg.button_size as keyof typeof sizes] || 32;
  const iconSz = Math.round(sz * 0.45);
  const radius = { rounded: 8, square: 4, circle: 999, pill: 999 }[cfg.button_style] || 999;

  const isFloating = cfg.display_mode.startsWith("floating");
  const isBottom = cfg.display_mode === "bottom-bar";

  const wrapStyle: React.CSSProperties = isFloating
    ? { position: "fixed", top: "50%", transform: "translateY(-50%)", [cfg.display_mode === "floating-left" ? "left" : "right"]: 8, zIndex: 9998 }
    : isBottom
    ? { position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9998, padding: "10px 12px", background: "rgba(255,255,255,0.97)", borderTop: "1px solid rgba(0,0,0,0.06)", backdropFilter: "blur(8px)" }
    // Inline mode: vertically stacked label + buttons, centered, with
    // breathing room above so it never crowds the preceding content.
    : { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "20px 0 4px" };

  const btnsStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    ...(isFloating ? { flexDirection: "column" } : {}),
  };

  const getColor = (brandColor: string) => {
    if (cfg.color_mode === "brand") return brandColor;
    if (cfg.color_mode === "mono-light") return "#f3f4f6";
    if (cfg.color_mode === "mono-dark") return "#374151";
    if (cfg.color_mode === "custom" && cfg.custom_color) return cfg.custom_color;
    return brandColor;
  };

  const getTextColor = () => {
    if (cfg.color_mode === "mono-light") return "#374151";
    return "#fff";
  };

  // Tiny contextual hint shown above the row in inline mode only. Floating
  // and bottom-bar are space-constrained, no label.
  const showLabel = !isFloating && !isBottom;

  return (
    <div style={wrapStyle}>
      {showLabel && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "rgba(0,0,0,0.45)",
          }}
        >
          Partager
        </span>
      )}
      <div style={btnsStyle}>
        {cfg.platforms.map((key) => {
          const p = PLATFORMS[key];
          if (!p) return null;
          const url = p.share(pageUrl, text, hashtags);
          return (
            <a
              key={key}
              href={url}
              target={key === "email" ? "_self" : "_blank"}
              rel="noopener noreferrer"
              onClick={key !== "email" ? (e) => { e.preventDefault(); window.open(url, `share_${key}`, "width=600,height=500,menubar=no,toolbar=no"); } : undefined}
              aria-label={`Partager sur ${p.name}`}
              title={p.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                border: "none",
                cursor: "pointer",
                textDecoration: "none",
                width: cfg.show_labels ? "auto" : sz,
                height: sz,
                minWidth: sz,
                padding: cfg.show_labels ? "0 14px" : 0,
                borderRadius: radius,
                backgroundColor: getColor(p.color),
                color: getTextColor(),
                fontSize: 13,
                fontWeight: 600,
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                transition: "transform .15s ease, box-shadow .15s ease, filter .15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.12)";
                e.currentTarget.style.filter = "brightness(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
                e.currentTarget.style.filter = "brightness(1)";
              }}
            >
              <PlatformIcon slug={key} size={iconSz} />
              {cfg.show_labels && <span>{p.name}</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}
