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

const PLATFORMS: Record<string, { name: string; color: string; icon: string; share: (u: string, t: string, h: string) => string }> = {
  facebook: { name: "Facebook", color: "#1877F2", icon: "f", share: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  twitter: { name: "X", color: "#000000", icon: "𝕏", share: (u, t, h) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}${t ? "&text=" + encodeURIComponent(t) : ""}${h ? "&hashtags=" + encodeURIComponent(h) : ""}` },
  linkedin: { name: "LinkedIn", color: "#0A66C2", icon: "in", share: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  whatsapp: { name: "WhatsApp", color: "#25D366", icon: "wa", share: (u, t) => `https://api.whatsapp.com/send?text=${encodeURIComponent((t ? t + " " : "") + u)}` },
  pinterest: { name: "Pinterest", color: "#E60023", icon: "P", share: (u, t) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(u)}&description=${encodeURIComponent(t || "")}` },
  telegram: { name: "Telegram", color: "#26A5E4", icon: "tg", share: (u, t) => `https://telegram.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t || "")}` },
  reddit: { name: "Reddit", color: "#FF4500", icon: "r", share: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t || document.title)}` },
  email: { name: "Email", color: "#7C7C7C", icon: "@", share: (u, t) => `mailto:?subject=${encodeURIComponent(t || document.title)}&body=${encodeURIComponent(u)}` },
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

  const sizes = { sm: 32, md: 40, lg: 48 };
  const sz = sizes[cfg.button_size as keyof typeof sizes] || 40;
  const iconSz = Math.round(sz * 0.45);
  const radius = { rounded: 8, square: 0, circle: 999, pill: 999 }[cfg.button_style] || 8;

  const isFloating = cfg.display_mode.startsWith("floating");
  const isBottom = cfg.display_mode === "bottom-bar";

  const wrapStyle: React.CSSProperties = isFloating
    ? { position: "fixed", top: "50%", transform: "translateY(-50%)", [cfg.display_mode === "floating-left" ? "left" : "right"]: 0, zIndex: 9998 }
    : isBottom
    ? { position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9998, padding: "8px 12px", background: "rgba(255,255,255,0.97)", borderTop: "1px solid rgba(0,0,0,0.08)", backdropFilter: "blur(8px)" }
    : { display: "flex", justifyContent: "center", padding: "12px 0" };

  const btnsStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    ...(isFloating ? { flexDirection: "column" } : {}),
    ...(isBottom ? { justifyContent: "center" } : {}),
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

  return (
    <div style={wrapStyle}>
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
              aria-label={`Share on ${p.name}`}
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
                transition: "transform .15s ease",
              }}
            >
              <span style={{ fontSize: iconSz, lineHeight: 1 }}>{p.icon}</span>
              {cfg.show_labels && <span>{p.name}</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}
