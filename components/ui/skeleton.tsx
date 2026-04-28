// components/ui/skeleton.tsx
// Animated shimmer skeleton — drop-in placeholder for any block of
// content that's still loading. Replaces the bespoke `animate-pulse
// bg-muted` stand-ins with a consistent, slightly nicer shimmer that
// matches the rest of the design refresh.
//
// USAGE
//   <Skeleton className="h-6 w-48" />            // single bar
//   <SkeletonText lines={3} />                   // multi-line paragraph
//   <SkeletonCard withAvatar />                  // generic card placeholder
//   <SkeletonAvatar size={40} />                 // circle
//
// All variants share the same shimmer keyframe (defined in globals.css
// as @keyframes shimmer) so a page full of skeletons feels coordinated
// instead of strobing at random rates.

import * as React from "react";
import { cn } from "@/lib/utils";

const SHIMMER =
  "relative overflow-hidden bg-surface-muted before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-card/80 before:to-transparent";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md", SHIMMER, className)} {...props} />;
}

function SkeletonAvatar({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={cn("rounded-full shrink-0", SHIMMER, className)}
    />
  );
}

function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          // Last line shorter so it "looks like text" not a stack of
          // identical bars.
          className={cn("h-3 rounded-md", SHIMMER, i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

function SkeletonCard({
  className,
  withAvatar = false,
}: {
  className?: string;
  withAvatar?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border/60 shadow-soft p-5 space-y-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {withAvatar && <SkeletonAvatar size={40} />}
        <div className={cn("h-5 w-1/2 rounded-md", SHIMMER)} />
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export { Skeleton, SkeletonAvatar, SkeletonText, SkeletonCard };
