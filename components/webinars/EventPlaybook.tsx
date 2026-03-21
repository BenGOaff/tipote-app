"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  FileText,
  Monitor,
  Megaphone,
  Flame,
  BarChart3,
  Sparkles,
  Loader2,
  ExternalLink,
  Lightbulb,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Webinar {
  id: string;
  title: string;
  topic: string | null;
  offer_name: string | null;
  event_type: string;
  playbook_progress?: Record<string, boolean>;
  playbook_data?: Record<string, unknown>;
}

interface PlaybookPhase {
  id: string;
  icon: React.ElementType;
  color: string;
  tipsKey: string;
  items: PlaybookItem[];
}

interface PlaybookItem {
  key: string;
  labelKey: string;
  generateAction?: {
    type: string;
    promptPrefix: string;
  };
}

interface Props {
  webinar: Webinar;
  onProgressUpdate: (progress: Record<string, boolean>) => void;
  onPlaybookDataUpdate: (data: Record<string, unknown>) => void;
}

// ─── Phase definitions ───────────────────────────────────────────────────────

function getPhases(isChallenge: boolean): Record<string, PlaybookPhase> {
  const c = isChallenge;
  return {
    phase1: {
      id: "phase1",
      icon: Package,
      color: "text-pink-600",
      tipsKey: c ? "tips_phase1_challenge" : "tips_phase1_webinar",
      items: [
        { key: "phase1_offer", labelKey: c ? "phase1_offer_challenge" : "phase1_offer_webinar" },
        { key: "phase1_promo", labelKey: "phase1_promo" },
        { key: "phase1_date", labelKey: c ? "phase1_date_challenge" : "phase1_date_webinar" },
        ...(c
          ? [
              { key: "phase1_vip", labelKey: "phase1_vip" },
              { key: "phase1_nonvip", labelKey: "phase1_nonvip" },
            ]
          : [{ key: "phase1_bonus", labelKey: "phase1_bonus" }]),
      ],
    },
    phase2: {
      id: "phase2",
      icon: FileText,
      color: "text-green-600",
      tipsKey: c ? "tips_phase2_challenge" : "tips_phase2_webinar",
      items: [
        { key: "phase2_program", labelKey: c ? "phase2_program_challenge" : "phase2_program_webinar" },
        {
          key: "phase2_script",
          labelKey: c ? "phase2_script_challenge" : "phase2_script_webinar",
          generateAction: { type: "video_script", promptPrefix: c ? "Script pour un challenge" : "Script pour un webinaire" },
        },
        { key: "phase2_slides", labelKey: "phase2_slides" },
        ...(c
          ? [{ key: "phase2_exercises", labelKey: "phase2_exercises" }]
          : [{ key: "phase2_demo", labelKey: "phase2_demo" }]),
      ],
    },
    phase3: {
      id: "phase3",
      icon: Monitor,
      color: "text-violet-600",
      tipsKey: "tips_phase3",
      items: [
        { key: "phase3_tech", labelKey: "phase3_tech" },
        { key: "phase3_platform", labelKey: "phase3_platform" },
        { key: "phase3_record", labelKey: "phase3_record" },
        { key: "phase3_rehearsal", labelKey: "phase3_rehearsal" },
        {
          key: "phase3_capture",
          labelKey: "phase3_capture",
          generateAction: { type: "sales_page", promptPrefix: "Page de capture pour" },
        },
        { key: "phase3_payment", labelKey: "phase3_payment" },
        ...(c ? [{ key: "phase3_banner", labelKey: "phase3_banner" }] : []),
      ],
    },
    phase4: {
      id: "phase4",
      icon: Megaphone,
      color: "text-blue-600",
      tipsKey: c ? "tips_phase4_challenge" : "tips_phase4_webinar",
      items: [
        ...(c
          ? [
              { key: "phase4_group", labelKey: "phase4_group" },
              { key: "phase4_teasing", labelKey: "phase4_teasing" },
            ]
          : []),
        {
          key: "phase4_emails_invite",
          labelKey: "phase4_emails_invite",
          generateAction: { type: "email", promptPrefix: "Email d'invitation pour" },
        },
        {
          key: "phase4_posts",
          labelKey: "phase4_posts",
          generateAction: { type: "post", promptPrefix: "Post de promotion pour" },
        },
        {
          key: "phase4_sequence",
          labelKey: c ? "phase4_sequence_challenge" : "phase4_sequence_webinar",
          generateAction: { type: "email", promptPrefix: c ? "Séquence de teasing pour" : "Séquence de rappels pour" },
        },
        { key: "phase4_partners", labelKey: "phase4_partners" },
      ],
    },
    phase5: {
      id: "phase5",
      icon: Flame,
      color: "text-orange-600",
      tipsKey: c ? "tips_phase5_challenge" : "tips_phase5_webinar",
      items: [
        {
          key: "phase5_reminder",
          labelKey: c ? "phase5_reminder_challenge" : "phase5_reminder_webinar",
          generateAction: { type: "email", promptPrefix: "Email de rappel pour" },
        },
        ...(c
          ? [
              { key: "phase5_exercises", labelKey: "phase5_exercises" },
              {
                key: "phase5_motivation",
                labelKey: "phase5_motivation",
                generateAction: { type: "post", promptPrefix: "Post de motivation jour X du challenge" },
              },
              { key: "phase5_pitch_j3", labelKey: "phase5_pitch_j3" },
              { key: "phase5_sale_j4", labelKey: "phase5_sale_j4" },
            ]
          : [
              { key: "phase5_engagement", labelKey: "phase5_engagement" },
              { key: "phase5_pitch", labelKey: "phase5_pitch" },
            ]),
      ],
    },
    phase6: {
      id: "phase6",
      icon: BarChart3,
      color: "text-purple-600",
      tipsKey: "tips_phase6",
      items: [
        {
          key: "phase6_bilan",
          labelKey: "phase6_bilan",
          generateAction: { type: "email", promptPrefix: "Email bilan post-événement pour" },
        },
        {
          key: "phase6_relance",
          labelKey: "phase6_relance",
          generateAction: { type: "email", promptPrefix: "Séquence de relance post-événement pour" },
        },
        { key: "phase6_urgency", labelKey: "phase6_urgency" },
        { key: "phase6_kpis", labelKey: "phase6_kpis" },
        { key: "phase6_replay", labelKey: c ? "phase6_replay_challenge" : "phase6_replay_webinar" },
      ],
    },
  };
}

// ─── AI Titles Generator ─────────────────────────────────────────────────────

function PlaybookAIGenerator({
  webinar,
  onDataUpdate,
  t,
}: {
  webinar: Webinar;
  onDataUpdate: (data: Record<string, unknown>) => void;
  t: (key: string) => string;
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<"idle" | "titles" | "program">("idle");
  const playData = (webinar.playbook_data ?? {}) as Record<string, unknown>;
  const titles = (playData.titles as Array<{ number: number; title: string; description: string }>) ?? [];
  const program = playData.program as Record<string, unknown> | null;
  const chosenTitle = playData.chosen_title as string | null;

  const generateTitles = useCallback(async () => {
    setGenerating(true);
    setStep("titles");
    try {
      const res = await fetch("/api/webinars/generate-playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: webinar.event_type,
          step: "titles",
        }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error ?? t("playbook.error"));
      const newData = { ...playData, titles: data.data?.titles ?? [] };
      onDataUpdate(newData);
      toast({ title: t("playbook.titlesGenerated") });
    } catch (e: any) {
      toast({ title: t("playbook.error"), description: e?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setStep("idle");
    }
  }, [webinar.event_type, playData, onDataUpdate, toast, t]);

  const selectTitle = useCallback(
    (title: string) => {
      const newData = { ...playData, chosen_title: title };
      onDataUpdate(newData);
    },
    [playData, onDataUpdate],
  );

  const generateProgram = useCallback(async () => {
    if (!chosenTitle) return;
    setGenerating(true);
    setStep("program");
    try {
      const res = await fetch("/api/webinars/generate-playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: webinar.event_type,
          step: "program",
          chosen_title: chosenTitle,
        }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error ?? t("playbook.error"));
      const newData = { ...playData, program: data.data?.program ?? null };
      onDataUpdate(newData);
      toast({ title: t("playbook.programGenerated") });
    } catch (e: any) {
      toast({ title: t("playbook.error"), description: e?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setStep("idle");
    }
  }, [webinar.event_type, chosenTitle, playData, onDataUpdate, toast, t]);

  const isChallenge = webinar.event_type === "challenge";

  return (
    <Card className="p-3 sm:p-4 space-y-4 border-dashed border-2 border-primary/20 bg-primary/5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary shrink-0" />
        <h3 className="font-semibold text-sm">
          {t("playbook.aiAssistant")} — {isChallenge ? t("playbook.aiAssistantChallenge") : t("playbook.aiAssistantWebinar")}
        </h3>
      </div>

      {/* Step 1: Generate titles */}
      {titles.length === 0 && !generating && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("playbook.aiIntro")}
          </p>
          <Button onClick={generateTitles} size="sm" className="w-full sm:w-auto">
            <Sparkles className="w-4 h-4 mr-1" />
            {t("playbook.generateTitles")}
          </Button>
        </div>
      )}

      {/* Loading state */}
      {generating && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {step === "titles" ? t("playbook.generatingTitles") : t("playbook.generatingProgram")}
          </span>
        </div>
      )}

      {/* Step 2: Show titles, let user pick */}
      {titles.length > 0 && !chosenTitle && !generating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium">{t("playbook.chooseTitlePrompt")}</p>
            <Button variant="ghost" size="sm" onClick={generateTitles}>
              <RefreshCw className="w-3 h-3 mr-1" />
              {t("playbook.regenerate")}
            </Button>
          </div>
          <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
            {titles.map((titleObj, i) => (
              <button
                key={i}
                onClick={() => selectTitle(titleObj.title)}
                className="text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <p className="font-medium text-sm">{titleObj.title}</p>
                {titleObj.description && (
                  <p className="text-xs text-muted-foreground mt-1">{titleObj.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Title chosen, generate program */}
      {chosenTitle && !program && !generating && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm">
              {t("playbook.titleChosen")} <span className="font-semibold">{chosenTitle}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateProgram} size="sm">
              <Sparkles className="w-4 h-4 mr-1" />
              {t("playbook.generateProgram")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newData = { ...playData, chosen_title: null };
                onDataUpdate(newData);
              }}
            >
              {t("playbook.changeTitle")}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Show generated program */}
      {chosenTitle && program && !generating && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm font-semibold truncate">{chosenTitle}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={generateProgram}>
              <RefreshCw className="w-3 h-3 mr-1" />
              {t("playbook.regenerate")}
            </Button>
          </div>

          {/* Challenge: days */}
          {isChallenge && Array.isArray((program as any).days) && (
            <div className="space-y-3">
              {((program as any).days as any[]).map((day: any) => (
                <Card key={day.day} className="p-3 bg-white">
                  <p className="font-semibold text-sm">
                    {t("playbook.day")} {day.day} : {day.theme}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{day.objective}</p>
                  {Array.isArray(day.exercises) && (
                    <ul className="mt-2 space-y-1.5">
                      {day.exercises.map((ex: any, j: number) => (
                        <li key={j} className="text-xs pl-3 border-l-2 border-primary/20">
                          <span className="font-medium">{ex.title}</span>
                          <span className="text-muted-foreground"> — {ex.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Webinar: sections */}
          {!isChallenge && Array.isArray((program as any).sections) && (
            <div className="space-y-3">
              {((program as any).sections as any[]).map((sec: any) => (
                <Card key={sec.section} className="p-3 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">{sec.title}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {sec.duration_minutes} {t("playbook.min")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{sec.content}</p>
                  {sec.engagement_tip && (
                    <p className="text-xs text-primary mt-1 flex items-start gap-1">
                      <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{sec.engagement_tip}</span>
                    </p>
                  )}
                </Card>
              ))}
              {(program as any).total_duration_minutes && (
                <p className="text-xs text-muted-foreground text-right">
                  {t("playbook.totalDuration")} : ~{(program as any).total_duration_minutes} {t("playbook.min")}
                </p>
              )}
            </div>
          )}

          {/* Bonus ideas */}
          {Array.isArray((program as any).bonus_ideas) && (program as any).bonus_ideas.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("playbook.bonusIdeas")}
              </p>
              <ul className="space-y-1">
                {((program as any).bonus_ideas as string[]).map((b, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-primary mt-0.5 shrink-0">*</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Offer pitch tips */}
          {Array.isArray((program as any).offer_pitch_tips) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("playbook.offerPitchTips")}
              </p>
              <ul className="space-y-1">
                {((program as any).offer_pitch_tips as string[]).map((tip, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-green-600 mt-0.5 shrink-0">*</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Promo strategies */}
          {Array.isArray((program as any).promo_strategies) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("playbook.promoStrategies")}
              </p>
              <ul className="space-y-1">
                {((program as any).promo_strategies as string[]).map((s, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-orange-600 mt-0.5 shrink-0">*</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Playbook Component ─────────────────────────────────────────────────

export default function EventPlaybook({ webinar, onProgressUpdate, onPlaybookDataUpdate }: Props) {
  const t = useTranslations("webinars");
  const [progress, setProgress] = useState<Record<string, boolean>>(webinar.playbook_progress ?? {});
  const isChallenge = webinar.event_type === "challenge";
  const phases = useMemo(() => getPhases(isChallenge), [isChallenge]);

  // Sync progress back
  useEffect(() => {
    setProgress(webinar.playbook_progress ?? {});
  }, [webinar.playbook_progress]);

  const toggleItem = useCallback(
    (key: string) => {
      const next = { ...progress, [key]: !progress[key] };
      setProgress(next);
      onProgressUpdate(next);
    },
    [progress, onProgressUpdate],
  );

  // Calculate completion per phase
  const phaseCompletion = useMemo(() => {
    const result: Record<string, { done: number; total: number }> = {};
    for (const [id, phase] of Object.entries(phases)) {
      const total = phase.items.length;
      const done = phase.items.filter((item) => progress[item.key]).length;
      result[id] = { done, total };
    }
    return result;
  }, [phases, progress]);

  const totalDone = Object.values(phaseCompletion).reduce((s, p) => s + p.done, 0);
  const totalItems = Object.values(phaseCompletion).reduce((s, p) => s + p.total, 0);
  const overallPct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  // Get tips as array — t.raw returns the raw JSON value
  function getTips(tipsKey: string): string[] {
    try {
      const raw = t.raw(`playbook.${tipsKey}`);
      if (Array.isArray(raw)) return raw as string[];
      return [];
    } catch {
      return [];
    }
  }

  // Get bonus tips for phase 6
  function getPhase6BonusTips(): string[] {
    const bonusKey1 = isChallenge ? "playbook.tips_phase6_challenge_bonus" : "playbook.tips_phase6_webinar_bonus";
    const bonusKey2 = isChallenge ? "playbook.tips_phase6_challenge_bonus2" : "playbook.tips_phase6_webinar_bonus2";
    return [t(bonusKey1), t(bonusKey2)];
  }

  function buildCreateUrl(action: { type: string; promptPrefix: string }) {
    const title = webinar.title || "";
    const topic = webinar.topic || "";
    const prompt = `${action.promptPrefix} "${title}"${topic ? ` — ${topic}` : ""}`;
    return `/create/${action.type}?template=event&prompt=${encodeURIComponent(prompt)}`;
  }

  return (
    <div className="space-y-4">
      {/* AI Generator */}
      <PlaybookAIGenerator
        webinar={webinar}
        onDataUpdate={onPlaybookDataUpdate}
        t={t}
      />

      {/* Overall progress */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-sm font-semibold">{t("playbook.progress")}</p>
          <Badge variant={overallPct === 100 ? "default" : "outline"} className="shrink-0">
            {totalDone}/{totalItems} — {overallPct}%
          </Badge>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </Card>

      {/* Phases accordion */}
      <Accordion type="multiple" defaultValue={["phase1"]}>
        {Object.entries(phases).map(([phaseId, phase]) => {
          const Icon = phase.icon;
          const comp = phaseCompletion[phaseId];
          const phasePct = comp.total > 0 ? Math.round((comp.done / comp.total) * 100) : 0;

          // Get phase label from i18n
          const phaseLabel = isChallenge
            ? (t.has(`playbook.${phaseId}.labelChallenge`) ? t(`playbook.${phaseId}.labelChallenge`) : t(`playbook.${phaseId}.label`))
            : t(`playbook.${phaseId}.label`);

          // Get tips
          const tips = getTips(phase.tipsKey);
          const bonusTips = phaseId === "phase6" ? getPhase6BonusTips() : [];
          const allTips = [...tips, ...bonusTips];

          return (
            <AccordionItem key={phaseId} value={phaseId} className="border rounded-lg mb-2 px-1">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${phase.color}`} />
                  <span className="font-semibold text-xs sm:text-sm truncate">{phaseLabel}</span>
                  <Badge
                    variant={phasePct === 100 ? "default" : "outline"}
                    className="ml-auto mr-2 text-[10px] shrink-0"
                  >
                    {comp.done}/{comp.total}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pl-4 sm:pl-8">
                  {/* Tips */}
                  {allTips.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3 shrink-0" />
                        {t("playbook.tips")}
                      </p>
                      {allTips.map((tip, i) => (
                        <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                          <span className="shrink-0 mt-0.5">-</span>
                          <span>{tip}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Checklist items */}
                  <div className="space-y-2.5 sm:space-y-2">
                    {phase.items.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-start gap-3 group"
                      >
                        <Checkbox
                          id={item.key}
                          checked={!!progress[item.key]}
                          onCheckedChange={() => toggleItem(item.key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={item.key}
                            className={`text-xs sm:text-sm cursor-pointer ${
                              progress[item.key] ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {t(`playbook.items.${item.labelKey}`)}
                          </label>
                          {item.generateAction && (
                            <a
                              href={buildCreateUrl(item.generateAction)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5 w-fit"
                            >
                              <Sparkles className="w-3 h-3 shrink-0" />
                              {t("playbook.generateWithAI")}
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
