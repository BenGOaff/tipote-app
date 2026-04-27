// components/ui/stat-card.tsx
// Stat block primitive: number + label + icon in a tinted circle.
// Mirrors the Waalaxy / Kawaak dashboard pattern so our metric grids feel
// consistent across pages.
//
// USAGE
// ─────
//   <StatCard
//     icon={<Eye className="w-5 h-5" />}
//     value="2 458"
//     label="Vues"
//   />
//   <StatCard tone="success" icon={<CheckCircle ... />} value={42} label="Complétions" />
//   <StatCard tone="warning" trend="+12% vs. semaine dernière" ... />

import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  success: { bg: "bg-emerald-500/10", fg: "text-emerald-600" },
  warning: { bg: "bg-amber-500/10", fg: "text-amber-600" },
  destructive: { bg: "bg-rose-500/10", fg: "text-rose-600" },
  neutral: { bg: "bg-muted", fg: "text-muted-foreground" },
} as const;

type Tone = keyof typeof tones;

type StatCardProps = {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  /** Optional sub-line (delta, comparison, etc.). */
  trend?: React.ReactNode;
  tone?: Tone;
  className?: string;
};

export function StatCard({
  icon,
  value,
  label,
  trend,
  tone = "primary",
  className,
}: StatCardProps) {
  const t = tones[tone];
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border/60 shadow-card p-4 sm:p-5",
        "flex items-start gap-3 sm:gap-4",
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center",
          t.bg,
          t.fg,
        )}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl sm:text-3xl font-bold leading-none tracking-tight tabular-nums text-foreground">
          {value}
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground mt-1.5">{label}</div>
        {trend ? <div className="text-[11px] text-muted-foreground/80 mt-1">{trend}</div> : null}
      </div>
    </div>
  );
}
