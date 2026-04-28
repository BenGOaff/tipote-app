// components/ui/page-shell.tsx
// Composition primitives for SaaS-grade page layouts. Use these instead of
// hand-rolled `p-4 sm:p-5 lg:p-6 max-w-[1200px] mx-auto` so every page in
// Tipote (and Tiquiz, by parity) inherits the same paddings, max-widths,
// and section gaps automatically.
//
// USAGE
// ─────
//   <PageContainer>
//     <PageHeading
//       title="Mes contenus"
//       subtitle="Tout ce que tu as créé"
//       actions={<Button>+ Créer</Button>}
//     />
//     <SectionCard>
//       … content …
//     </SectionCard>
//   </PageContainer>
//
// NOTE: this component is named PageHeading (not PageHeader) to avoid
// clashing with the existing global PageHeader (the app's top bar).
//
// All three components are unopinionated about what's inside — they only
// own paddings, surfaces, radius, shadow, typography. Mix freely.

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── PageContainer ─────────────────────────────────────────────────────
// Standard page wrapper. Hands the inner content the right horizontal
// padding (responsive), top/bottom padding, and a centered max-width.
// `space-y-5` between direct children matches the Waalaxy / Kawaak rhythm:
// generous but not bloated.

type PageContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Caps the content width. Defaults to "lg" (1200px), use "xl" for stat-heavy
   *  dashboards or "md" for narrow form pages. */
  width?: "md" | "lg" | "xl" | "full";
};

const widthMap = {
  md: "max-w-3xl",
  lg: "max-w-[1200px]",
  xl: "max-w-[1440px]",
  full: "max-w-none",
} as const;

export function PageContainer({
  width = "lg",
  className,
  children,
  ...rest
}: PageContainerProps) {
  return (
    <div className={cn("flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8", className)} {...rest}>
      <div className={cn("mx-auto w-full space-y-6", widthMap[width])}>{children}</div>
    </div>
  );
}

// ─── PageHeading ───────────────────────────────────────────────────────
// In-content page heading: title + optional subtitle + actions slot, in a
// clean flex row that wraps gracefully on mobile. Use this AT THE TOP of
// every PageContainer instead of a hand-rolled <div> with a heading.
//
// IMPORTANT: name is PageHeading (not PageHeader) to avoid clashing with
// the existing global PageHeader component (the app's top bar).

type PageHeadingProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned content (CTAs, filters, etc.). Wraps below on small screens. */
  actions?: React.ReactNode;
  /** Optional eyebrow above the title — e.g. small icon + label. */
  eyebrow?: React.ReactNode;
  className?: string;
};

export function PageHeading({ title, subtitle, actions, eyebrow, className }: PageHeadingProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-[1.1] text-foreground tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
    </div>
  );
}

// ─── SectionCard ───────────────────────────────────────────────────────
// The default container for any "block of content" inside a page (filters
// strip, list, form section, info panel). Replaces the inconsistent mix of
// `Card / div / Card with custom border` we have across the app today.
//
// Variants:
//   - default : white bg, soft shadow, very subtle border, padding p-5
//   - muted   : surface-muted bg (subdued helper panels)
//   - flat    : white bg, no shadow, just border (lists where shadow stacking
//               would feel busy)

type SectionCardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "muted" | "flat";
  /** Adjusts internal padding. md = p-5 (default), lg = p-6, sm = p-4. */
  padding?: "sm" | "md" | "lg" | "none";
  /** Adds a hover shadow lift — useful when the card is the click target. */
  interactive?: boolean;
};

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 sm:p-7",
} as const;

export function SectionCard({
  variant = "default",
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: SectionCardProps) {
  const variantClass =
    variant === "muted"
      ? "bg-surface-muted border border-border/60"
      : variant === "flat"
        ? "bg-card border border-border"
        : "bg-card border border-border/60 shadow-card";
  return (
    <div
      className={cn(
        "rounded-xl",
        variantClass,
        paddingMap[padding],
        interactive && "transition-shadow hover:shadow-card-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ─── SectionCardHeader / Title / Description ───────────────────────────
// Optional sub-components for SectionCard. Mirror shadcn Card primitives
// but with our typography scale (no oversized headings inside cards).

export function SectionCardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-1 mb-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionCardTitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold leading-tight text-foreground", className)} {...rest}>
      {children}
    </h3>
  );
}

export function SectionCardDescription({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-muted-foreground leading-relaxed", className)} {...rest}>
      {children}
    </p>
  );
}
