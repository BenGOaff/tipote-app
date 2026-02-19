// components/create/AutoCommentPanel.tsx
// Auto-comment configuration panel shown in the post creation flow.
// Visible to all plans, but only interactive for PRO and ELITE.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageCircle,
  Lock,
  Zap,
  Info,
  Crown,
} from "lucide-react";

const CREDIT_PER_COMMENT = 0.25;

export type AutoCommentConfig = {
  enabled: boolean;
  nbBefore: number;
  nbAfter: number;
  creditsNeeded: number;
};

// Platforms that support auto-comments (have a public post-search API)
const SUPPORTED_PLATFORMS = ["linkedin", "twitter", "reddit"];

type AutoCommentPanelProps = {
  /** Current user plan */
  userPlan: string | null;
  /** The platform this post targets (linkedin, twitter, reddit, threads, facebook, instagram…) */
  platform?: string;
  /** Callback when config changes */
  onChange: (config: AutoCommentConfig) => void;
  /** Disabled state (e.g. while saving) */
  disabled?: boolean;
};

function normalizePlan(plan: string | null | undefined): string {
  const s = (plan ?? "").trim().toLowerCase();
  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("beta")) return "beta";
  if (s.includes("pro") || s.includes("essential")) return "pro";
  if (s.includes("basic")) return "basic";
  return "free";
}

function planHasAccess(plan: string): boolean {
  return ["pro", "elite", "beta"].includes(plan);
}

export function AutoCommentPanel({
  userPlan,
  platform,
  onChange,
  disabled = false,
}: AutoCommentPanelProps) {
  const plan = useMemo(() => normalizePlan(userPlan), [userPlan]);
  const hasAccess = useMemo(() => planHasAccess(plan), [plan]);
  const platformSupported = useMemo(
    () => !platform || SUPPORTED_PLATFORMS.includes(platform.toLowerCase()),
    [platform],
  );

  const [enabled, setEnabled] = useState(false);
  const [nbBefore, setNbBefore] = useState(3);
  const [nbAfter, setNbAfter] = useState(3);

  const creditsNeeded = useMemo(
    () => (nbBefore + nbAfter) * CREDIT_PER_COMMENT,
    [nbBefore, nbAfter],
  );

  // Notify parent of config changes
  useEffect(() => {
    onChange({
      enabled: enabled && hasAccess && platformSupported,
      nbBefore: enabled ? nbBefore : 0,
      nbAfter: enabled ? nbAfter : 0,
      creditsNeeded: enabled ? creditsNeeded : 0,
    });
  }, [enabled, nbBefore, nbAfter, creditsNeeded, hasAccess, platformSupported, onChange]);

  return (
    <Card
      className={`p-4 border-2 transition-all ${
        !platformSupported
          ? "border-dashed border-muted-foreground/20 bg-muted/20"
          : enabled && hasAccess
            ? "border-primary bg-primary/5 dark:bg-primary/10"
            : !hasAccess
              ? "border-dashed border-muted-foreground/30 bg-muted/30"
              : "border-border"
      }`}
    >
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                !platformSupported
                  ? "bg-muted"
                  : hasAccess
                    ? "bg-primary/10 dark:bg-primary/20"
                    : "bg-muted"
              }`}
            >
              {!platformSupported || !hasAccess ? (
                <Lock className="w-4 h-4 text-muted-foreground" />
              ) : (
                <MessageCircle className="w-4 h-4 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Auto-commentaires</span>
                {!hasAccess && platformSupported && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">
                    <Crown className="w-3 h-3 mr-0.5" />
                    PRO
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {!platformSupported
                  ? `Non disponible sur ${platform ?? "cette plateforme"} — LinkedIn, Twitter/X et Reddit uniquement`
                  : hasAccess
                    ? "Commentez automatiquement des posts similaires pour booster votre visibilité"
                    : "Passez au plan Pro ou Elite pour débloquer cette fonctionnalité"}
              </p>
            </div>
          </div>

          <Switch
            checked={enabled && hasAccess && platformSupported}
            onCheckedChange={(v) => {
              if (!hasAccess || !platformSupported) return;
              setEnabled(v);
            }}
            disabled={disabled || !hasAccess || !platformSupported}
          />
        </div>

        {/* Not supported by platform API */}
        {!platformSupported && (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                L&apos;API de {platform ?? "cette plateforme"} ne permet pas de rechercher des posts publics.
                Les auto-commentaires fonctionnent sur <strong>LinkedIn</strong>, <strong>Twitter/X</strong> et <strong>Reddit</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Locked overlay for FREE/BASIC */}
        {platformSupported && !hasAccess && (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-3">
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <p className="font-medium mb-1">
                  Boostez votre engagement avec l&apos;auto-commentaire
                </p>
                <p className="text-amber-600 dark:text-amber-500">
                  Tipote commente automatiquement des posts similaires au vôtre pour augmenter
                  votre visibilité. Disponible avec les plans Pro (49€/mois) et Elite (99€/mois).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Config controls (shown when enabled, has access, and platform is supported) */}
        {hasAccess && enabled && platformSupported && (
          <div className="space-y-4 pt-2 border-t">
            {/* Before comments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1.5">
                  Commentaires avant publication
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-xs">
                          Tipote commentera des posts similaires 2-15 min avant la publication
                          de votre post pour générer de la visibilité en amont.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Badge variant="secondary" className="text-xs">{nbBefore}</Badge>
              </div>
              <Slider
                value={[nbBefore]}
                min={0}
                max={5}
                step={1}
                onValueChange={(vals: number[]) => setNbBefore(vals[0])}
                disabled={disabled}
              />
            </div>

            {/* After comments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1.5">
                  Commentaires après publication
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-xs">
                          Tipote commentera des posts similaires 2-15 min après la publication
                          pour prolonger l&apos;engagement.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Badge variant="secondary" className="text-xs">{nbAfter}</Badge>
              </div>
              <Slider
                value={[nbAfter]}
                min={0}
                max={5}
                step={1}
                onValueChange={(vals: number[]) => setNbAfter(vals[0])}
                disabled={disabled}
              />
            </div>

            {/* Credits info */}
            <p className="text-xs text-muted-foreground">
              0,25 crédit par commentaire
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
