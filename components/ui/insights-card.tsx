// components/ui/insights-card.tsx
// Visual surface for the rule-based insights from lib/insights.ts.
// Renders a list of small cards with an icon, headline, body and CTA.
// Pass the array straight from computeInsights() and the component
// figures out the rest.
//
// Each card uses a tone-tinted left strip (warning amber, success
// emerald, info sky, primary blue) so the user can scan the wall and
// know "ah, that's an alert" vs "that's good news" without reading.

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Insight } from "@/lib/insights";

const TONES: Record<
  Insight["tone"],
  { icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }
> = {
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-100 dark:bg-amber-900/30",
    fg: "text-amber-700 dark:text-amber-300",
  },
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    fg: "text-emerald-700 dark:text-emerald-300",
  },
  info: {
    icon: Lightbulb,
    bg: "bg-sky-100 dark:bg-sky-900/30",
    fg: "text-sky-700 dark:text-sky-300",
  },
  primary: {
    icon: Sparkles,
    bg: "bg-primary/10",
    fg: "text-primary",
  },
};

type Props = {
  insights: Insight[];
  className?: string;
  /** Optional title above the list. Defaults to "Suggestions pour toi". */
  title?: string;
};

export function InsightsList({ insights, className, title = "Suggestions pour toi" }: Props) {
  if (insights.length === 0) return null;
  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-2">
        {insights.map((i) => {
          const tone = TONES[i.tone] ?? TONES.primary;
          const Icon = tone.icon;
          return (
            <div
              key={i.id}
              className={cn(
                "rounded-xl bg-card border border-border/60 shadow-soft p-4",
                "flex items-start gap-3",
              )}
            >
              <div
                className={cn(
                  "shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
                  tone.bg,
                  tone.fg,
                )}
                aria-hidden
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="text-sm font-semibold text-foreground leading-tight">
                  {i.title}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{i.body}</p>
              </div>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="rounded-full shrink-0 -my-1"
              >
                <Link href={i.ctaHref}>
                  {i.ctaLabel}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
