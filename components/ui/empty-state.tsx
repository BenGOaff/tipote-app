// components/ui/empty-state.tsx
// Empty state primitive — never leave a list / page bare. Provides a
// consistent visual lockup of icon → heading → description → CTA(s) so
// every "no results" / "no data yet" surface looks like a proper SaaS,
// not a blank canvas.
//
// USAGE
// ─────
//   <EmptyState
//     icon={<Inbox />}
//     title="Aucun lead pour le moment"
//     description="Partage ton quiz pour commencer à recevoir des leads."
//     primaryAction={<Button>Partager</Button>}
//     secondaryAction={<Button variant="ghost">Voir l'aperçu</Button>}
//   />
//
// Place it INSIDE a SectionCard (variant="flat") for in-content empty
// states, or use the wrapped form (`compact={false}`, default) for
// stand-alone full-page emptiness.

import * as React from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Compact variant for in-list emptiness; default is full-bleed. */
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "py-8" : "py-12 sm:py-16",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-full bg-surface-soft text-primary flex items-center justify-center mb-4",
          compact ? "w-12 h-12" : "w-16 h-16",
        )}
        aria-hidden
      >
        {icon}
      </div>
      <h3
        className={cn(
          "font-semibold text-foreground tracking-tight",
          compact ? "text-base" : "text-lg sm:text-xl",
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            "text-muted-foreground leading-relaxed max-w-md mt-1.5",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </p>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
