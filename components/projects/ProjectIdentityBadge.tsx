"use client";

// Visual identity badge for a project: a small "icon chip" + name,
// styled with the project's accent color when set. Reused by:
//   - the header pill (ProjectSwitcher trigger)
//   - the sidebar bottom indicator
//   - the dropdown items in the project picker
//
// Resolution order for the icon:
//   1. use_branding_logo === true AND a logo URL → render the logo
//   2. icon_emoji set → render the emoji
//   3. neither → fall back to a folder glyph
//
// We don't fetch the branding logo from here — the parent passes it
// in (it lives on business_profiles.brand_logo_url, scoped per project).

import { FolderOpen } from "lucide-react";

export interface ProjectBadgeProject {
  id: string;
  name: string;
  accent_color?: string | null;
  icon_emoji?: string | null;
  use_branding_logo?: boolean | null;
}

interface Props {
  project: ProjectBadgeProject;
  /** Logo URL pulled from business_profiles.brand_logo_url for the
   *  project — used when use_branding_logo is true. */
  brandingLogoUrl?: string | null;
  /** Visual size — adjusts both the icon chip and the gap. */
  size?: "sm" | "md" | "lg";
  /** Optional custom name override (e.g. translated default name). */
  nameOverride?: string;
  /** Hide the name and only render the icon chip. */
  iconOnly?: boolean;
  className?: string;
}

const SIZE_TOKENS: Record<
  "sm" | "md" | "lg",
  { chip: string; emoji: string; glyph: string; text: string; gap: string }
> = {
  sm: {
    chip: "size-5 text-[11px]",
    emoji: "text-xs",
    glyph: "size-3",
    text: "text-xs",
    gap: "gap-1.5",
  },
  md: {
    chip: "size-6 text-sm",
    emoji: "text-sm",
    glyph: "size-3.5",
    text: "text-sm",
    gap: "gap-2",
  },
  lg: {
    chip: "size-8 text-base",
    emoji: "text-lg",
    glyph: "size-4",
    text: "text-sm font-semibold",
    gap: "gap-2.5",
  },
};

export function ProjectIdentityBadge({
  project,
  brandingLogoUrl,
  size = "md",
  nameOverride,
  iconOnly,
  className,
}: Props) {
  const tokens = SIZE_TOKENS[size];
  const accent = project.accent_color || null;
  const useLogo = project.use_branding_logo && brandingLogoUrl;
  const emoji = project.icon_emoji;

  // The chip background is a tinted version of the accent if set, else
  // a subtle muted fill. Border keeps it visible on busy headers.
  const chipStyle = accent
    ? {
        backgroundColor: `${accent}1f`, // ~12% opacity
        borderColor: `${accent}66`, // ~40% opacity
        color: accent,
      }
    : undefined;

  return (
    <span className={`inline-flex items-center ${tokens.gap} ${className ?? ""}`}>
      <span
        className={`${tokens.chip} grid place-items-center rounded-md border bg-muted/60 overflow-hidden shrink-0`}
        style={chipStyle}
        aria-hidden
      >
        {useLogo ? (
          <img
            src={brandingLogoUrl!}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              // Logo broken — fall back to emoji or glyph by hiding the
              // img. The CSS class on the parent stays so the chip
              // still has its tint.
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : emoji ? (
          <span className={tokens.emoji} aria-hidden>
            {emoji}
          </span>
        ) : (
          <FolderOpen className={`${tokens.glyph} text-muted-foreground`} />
        )}
      </span>
      {!iconOnly ? (
        <span className={`${tokens.text} truncate`}>
          {nameOverride ?? project.name}
        </span>
      ) : null}
    </span>
  );
}
