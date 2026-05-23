"use client";

// app/affiliate/components/AffiliateTour.tsx
//
// Tutoriel guidé pour les nouveaux affiliés. 5 modales successives
// expliquant les essentiels (lien, promouvoir, trial, paliers).
// Auto-déclenchement au premier login (onboardedAt = null).
// Multilang via useDict() — wording dans /affiliate/i18n/.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Link2,
  Megaphone,
  Gift,
  Award,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { useDict } from "../i18n/context";

export function AffiliateTour({ onboardedAt }: { onboardedAt: string | null }) {
  const t = useDict();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Steps construites avec les strings du dict (calculées à chaque
  // re-render parce que la langue peut changer via LocaleSwitcher).
  const STEPS = [
    {
      icon: Sparkles,
      title: t.tour.step1_title,
      description: t.tour.step1_subtitle,
      body: (
        <>
          <p>
            {/* On colore "40 to 50% commission" en gras via dangerouslySetInnerHTML serait
                surengineering — on laisse le texte plein. */}
            {t.tour.step1_body_1}
          </p>
          <p className="text-sm text-muted-foreground mt-3">{t.tour.step1_body_2}</p>
        </>
      ),
    },
    {
      icon: Link2,
      title: t.tour.step2_title,
      description: t.tour.step2_subtitle,
      body: (
        <>
          <p>{t.tour.step2_body_intro}</p>
          <ul className="space-y-2 mt-3 text-sm">
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{t.tour.step2_bullet_cookie}</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{t.tour.step2_bullet_lasttouch}</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{t.tour.step2_bullet_anywhere}</span>
            </li>
          </ul>
        </>
      ),
    },
    {
      icon: Megaphone,
      title: t.tour.step3_title,
      description: t.tour.step3_subtitle,
      body: (
        <>
          <p>{t.tour.step3_body_intro}</p>
          <ul className="space-y-2 mt-3 text-sm">
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{t.tour.step3_bullet_emails}</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{t.tour.step3_bullet_posts}</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{t.tour.step3_bullet_visuals}</span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">{t.tour.step3_body_outro}</p>
        </>
      ),
    },
    {
      icon: Gift,
      title: t.tour.step4_title,
      description: t.tour.step4_subtitle,
      body: (
        <>
          <p>{t.tour.step4_body_1}</p>
          <p className="text-sm text-muted-foreground mt-3">{t.tour.step4_body_2}</p>
        </>
      ),
    },
    {
      icon: Award,
      title: t.tour.step5_title,
      description: t.tour.step5_subtitle,
      body: (
        <>
          <p>{t.tour.step5_body_intro}</p>
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border">
              <span className="text-sm">{t.tour.step5_tier_low}</span>
              <span className="font-bold text-sm">40%</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/30">
              <span className="text-sm">{t.tour.step5_tier_mid}</span>
              <span className="font-bold text-sm">45%</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/50">
              <span className="text-sm">{t.tour.step5_tier_high}</span>
              <span className="font-bold text-sm">50%</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">{t.tour.step5_body_outro}</p>
        </>
      ),
    },
  ];

  useEffect(() => {
    if (onboardedAt) return;
    const timer = setTimeout(() => setIsOpen(true), 600);
    return () => clearTimeout(timer);
  }, [onboardedAt]);

  useEffect(() => {
    function handler() {
      setCurrentStep(0);
      setIsOpen(true);
    }
    window.addEventListener("affiliate-tour-start", handler);
    return () => window.removeEventListener("affiliate-tour-start", handler);
  }, []);

  async function complete() {
    setSaving(true);
    try {
      await fetch("/affiliate/api/onboarded", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
    } catch {
      // best effort
    }
    setSaving(false);
    setIsOpen(false);
    router.refresh();
  }

  async function skip() {
    await complete();
  }

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;
  const Icon = step.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && skip()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{step.title}</DialogTitle>
              <DialogDescription className="text-xs">{step.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="text-sm leading-relaxed py-2">{step.body}</div>

        <div className="flex items-center gap-1.5 justify-center pt-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep
                  ? "w-6 bg-primary"
                  : i < currentStep
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={skip}
            disabled={saving}
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            {t.tour.skip}
          </Button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                disabled={saving}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {isLast ? (
              <Button onClick={complete} disabled={saving}>
                {saving ? "..." : t.tour.finish}
                <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={saving}
              >
                {t.tour.next}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
