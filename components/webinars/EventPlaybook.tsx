"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  items: PlaybookItem[];
  tips: string[];
}

interface PlaybookItem {
  key: string;
  label: string;
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
  return {
    phase1: {
      id: "phase1",
      icon: Package,
      color: "text-pink-600",
      tips: isChallenge
        ? [
            "Offre entre 97€ et 500€ : type formation complète",
            "Faire le challenge en début ou milieu de mois (sinon les gens sont fauchés !)",
            "Prévoir 80% de promo pour l'offre spéciale challenge",
            "Option VIP : coachings supplémentaires + bonus + accès à vie aux replays",
            "Non VIP : replay disponible d'un jour sur l'autre seulement",
          ]
        : [
            "Choisir une offre entre 97€ et 997€ selon la complexité du sujet",
            "Faire le webinaire en début ou milieu de mois (meilleur taux de conversion)",
            "Prévoir une offre limitée dans le temps pour créer l'urgence",
            "Bonus exclusif réservé aux participants live pour encourager la présence",
          ],
      items: [
        { key: "phase1_offer", label: isChallenge ? "Choisir l'offre à vendre à la fin du challenge" : "Choisir l'offre à vendre à la fin du webinaire" },
        { key: "phase1_promo", label: "Définir la promo spéciale (réduction, bonus, places limitées...)" },
        { key: "phase1_date", label: isChallenge ? "Fixer les dates (4 jours consécutifs recommandés)" : "Fixer la date et l'heure" },
        ...(isChallenge
          ? [
              { key: "phase1_vip", label: "Préparer l'option VIP (coaching + bonus + accès à vie)" },
              { key: "phase1_nonvip", label: "Définir l'accès non-VIP (replay limité dans le temps)" },
            ]
          : [
              { key: "phase1_bonus", label: "Préparer un bonus exclusif pour les participants live" },
            ]),
      ],
    },
    phase2: {
      id: "phase2",
      icon: FileText,
      color: "text-green-600",
      tips: isChallenge
        ? [
            "Prévoir un max de valeur concrète pour démontrer ta crédibilité",
            "Slides + exemples concrets + exercices journaliers",
            "Jour 1 : Intro + valeur + exercice / Jour 2 : Approfondissement + exercice",
            "Jour 3 : Plan d'action + exercice + pitch offre / Jour 4 : Coaching live + vente",
            "Coaching en direct pour le membre le plus actif = boost d'engagement",
          ]
        : [
            "Prévoir un max de valeur concrète pour démontrer ta crédibilité",
            "Structure : Accroche → Contenu de valeur → Preuve → Offre → Q&A",
            "Durée idéale : 45 à 75 minutes (inclus la vente)",
            "Slides épurées : 1 idée par slide, peu de texte, beaucoup de visuel",
          ],
      items: [
        {
          key: "phase2_program",
          label: isChallenge ? "Valider le programme jour par jour" : "Valider le plan du webinaire",
        },
        {
          key: "phase2_script",
          label: isChallenge ? "Préparer le contenu de chaque jour" : "Préparer le script / les points clés",
          generateAction: { type: "video_script", promptPrefix: isChallenge ? "Script pour un challenge" : "Script pour un webinaire" },
        },
        { key: "phase2_slides", label: "Préparer les slides" },
        ...(isChallenge
          ? [{ key: "phase2_exercises", label: "Définir les exercices pour chaque jour" }]
          : [{ key: "phase2_demo", label: "Préparer une démonstration / cas concret" }]),
      ],
    },
    phase3: {
      id: "phase3",
      icon: Monitor,
      color: "text-violet-600",
      tips: [
        "Matériel : un micro correct + une bonne webcam",
        "Logiciel de live : Zoom, WebinarJam, StreamYard... (prévoir mini 500 participants)",
        "Prévoir l'enregistrement pour les replays (revente possible ensuite !)",
        "S'entraîner pour être à l'aise le jour J",
        "Systeme.io ou équivalent : branding simple (couleurs + photo)",
        "Connecter les moyens de paiement + tester les automatisations",
      ],
      items: [
        { key: "phase3_tech", label: "Micro + webcam testés et fonctionnels" },
        { key: "phase3_platform", label: "Plateforme de live configurée" },
        { key: "phase3_record", label: "Système d'enregistrement (pour replays) prêt" },
        { key: "phase3_rehearsal", label: "Répétition faite (au moins 1 fois)" },
        {
          key: "phase3_capture",
          label: "Page de capture + page de remerciement créées",
          generateAction: { type: "sales_page", promptPrefix: "Page de capture pour" },
        },
        { key: "phase3_payment", label: "Moyens de paiement connectés et testés" },
        ...(isChallenge
          ? [{ key: "phase3_banner", label: "Bannière pour le groupe communautaire créée" }]
          : []),
      ],
    },
    phase4: {
      id: "phase4",
      icon: Megaphone,
      color: "text-blue-600",
      tips: isChallenge
        ? [
            "Créer un groupe privé (Facebook, Telegram, WhatsApp...) dédié au challenge",
            "Animation du groupe : présentations des participants + vidéo teasing",
            "Emails : teasing + apport de valeur + curiosité + bénéfices + urgence",
            "Partager par email + réseaux sociaux (groupes ciblés)",
            "Partenaires/affiliés : taux de commission minimum 30%",
            "Leur partager la page de capture bien paramétrée avec lien affilié",
          ]
        : [
            "Emails : teasing + apport de valeur + curiosité + bénéfices + urgence",
            "Partager par email + réseaux sociaux (groupes ciblés)",
            "Partenaires/affiliés : taux de commission minimum 30%",
            "Créer un événement sur les réseaux pour augmenter la visibilité",
          ],
      items: [
        ...(isChallenge
          ? [{ key: "phase4_group", label: "Groupe privé créé (Facebook, Telegram...)" },
             { key: "phase4_teasing", label: "Vidéo de teasing / présentation postée" }]
          : []),
        {
          key: "phase4_emails_invite",
          label: "Emails d'annonce et d'invitation envoyés (J-7)",
          generateAction: { type: "email", promptPrefix: "Email d'invitation pour" },
        },
        {
          key: "phase4_posts",
          label: "Posts de promotion sur les réseaux sociaux",
          generateAction: { type: "post", promptPrefix: "Post de promotion pour" },
        },
        {
          key: "phase4_sequence",
          label: isChallenge ? "Séquence emails de teasing pré-challenge" : "Séquence emails de rappel pré-webinaire",
          generateAction: { type: "email", promptPrefix: isChallenge ? "Séquence de teasing pour" : "Séquence de rappels pour" },
        },
        { key: "phase4_partners", label: "Partenaires / affiliés contactés (commission 30% min)" },
      ],
    },
    phase5: {
      id: "phase5",
      icon: Flame,
      color: "text-orange-600",
      tips: isChallenge
        ? [
            "Rappels : J-1 + le matin de chaque jour + 1h avant le live",
            "Poster l'exercice du jour dans le groupe après chaque session",
            "Post récap + motivation quotidien dans le groupe",
            "Jour 3 : première mention de l'offre (soft pitch)",
            "Jour 4 : vente complète + ouverture des paiements en plusieurs fois",
          ]
        : [
            "Rappels : J-7, J-1, le matin même, 1h avant, 15min avant",
            "Pendant le live : poser des questions pour garder l'audience active",
            "Présenter l'offre au bon moment : après avoir démontré la valeur",
            "Ne pas être pushy : montrer la transformation, pas le produit",
          ],
      items: [
        {
          key: "phase5_reminder",
          label: isChallenge ? "Rappels quotidiens envoyés (email + groupe)" : "Rappels envoyés (J-1, H-1)",
          generateAction: { type: "email", promptPrefix: "Email de rappel pour" },
        },
        ...(isChallenge
          ? [
              { key: "phase5_exercises", label: "Exercices quotidiens partagés dans le groupe" },
              {
                key: "phase5_motivation",
                label: "Posts de motivation et récap quotidiens",
                generateAction: { type: "post", promptPrefix: "Post de motivation jour X du challenge" },
              },
              { key: "phase5_pitch_j3", label: "Pitch de l'offre présenté (Jour 3)" },
              { key: "phase5_sale_j4", label: "Vente finale + paiements ouverts (Jour 4)" },
            ]
          : [
              { key: "phase5_engagement", label: "Questions d'engagement préparées pour le live" },
              { key: "phase5_pitch", label: "Offre présentée avec bonus + urgence" },
            ]),
      ],
    },
    phase6: {
      id: "phase6",
      icon: BarChart3,
      color: "text-purple-600",
      tips: [
        "Envoyer un email bilan dans les 24h après l'événement",
        "Relancer sur le groupe + rappel de l'offre avec urgence",
        "Séquence de relance : J+1, J+2, J+3 (dernière chance)",
        isChallenge
          ? "BONUS : relancer le challenge en mode replay pour re-vendre l'offre !"
          : "BONUS : proposer le replay aux absents avec un lien limité dans le temps !",
        isChallenge
          ? "BONUS : re-vendre l'offre spéciale via le replay du challenge"
          : "BONUS : créer un mini-cours à partir du contenu du webinaire",
      ],
      items: [
        {
          key: "phase6_bilan",
          label: "Email bilan envoyé",
          generateAction: { type: "email", promptPrefix: "Email bilan post-événement pour" },
        },
        {
          key: "phase6_relance",
          label: "Séquence de relance envoyée (J+1, J+2, J+3)",
          generateAction: { type: "email", promptPrefix: "Séquence de relance post-événement pour" },
        },
        { key: "phase6_urgency", label: "Rappel avec urgence (fermeture de l'offre)" },
        { key: "phase6_kpis", label: "KPIs remplis dans Tipote" },
        {
          key: "phase6_replay",
          label: isChallenge ? "Replay du challenge préparé pour re-vente" : "Replay envoyé aux inscrits absents",
        },
      ],
    },
  };
}

const PHASE_LABELS: Record<string, { label: string; labelChallenge?: string }> = {
  phase1: { label: "Préparer l'offre" },
  phase2: { label: "Contenu", labelChallenge: "Contenu du challenge" },
  phase3: { label: "Préparation technique" },
  phase4: { label: "Acquisition & Communauté" },
  phase5: { label: "Pendant l'événement", labelChallenge: "Pendant le challenge" },
  phase6: { label: "Suivi & Réutilisation" },
};

// ─── AI Titles Generator ─────────────────────────────────────────────────────

function PlaybookAIGenerator({
  webinar,
  onDataUpdate,
}: {
  webinar: Webinar;
  onDataUpdate: (data: Record<string, unknown>) => void;
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
      if (!data?.ok) throw new Error(data?.error ?? "Erreur");
      const newData = { ...playData, titles: data.data?.titles ?? [] };
      onDataUpdate(newData);
      toast({ title: "Titres générés !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setStep("idle");
    }
  }, [webinar.event_type, playData, onDataUpdate, toast]);

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
      if (!data?.ok) throw new Error(data?.error ?? "Erreur");
      const newData = { ...playData, program: data.data?.program ?? null };
      onDataUpdate(newData);
      toast({ title: "Programme généré !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setStep("idle");
    }
  }, [webinar.event_type, chosenTitle, playData, onDataUpdate, toast]);

  const isChallenge = webinar.event_type === "challenge";

  return (
    <Card className="p-4 space-y-4 border-dashed border-2 border-primary/20 bg-primary/5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-sm">
          Assistant IA — {isChallenge ? "Créer ton challenge" : "Créer ton webinaire"}
        </h3>
      </div>

      {/* Step 1: Generate titles */}
      {titles.length === 0 && !generating && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            L&apos;IA va utiliser ta niche, ton persona et tes offres pour te proposer des idées de{" "}
            {isChallenge ? "challenges" : "webinaires"} percutants.
          </p>
          <Button onClick={generateTitles} size="sm">
            <Sparkles className="w-4 h-4 mr-1" />
            Générer des idées de titres
          </Button>
        </div>
      )}

      {/* Loading state */}
      {generating && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {step === "titles" ? "Génération des titres..." : "Génération du programme..."}
          </span>
        </div>
      )}

      {/* Step 2: Show titles, let user pick */}
      {titles.length > 0 && !chosenTitle && !generating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Choisis le titre qui te parle le plus :</p>
            <Button variant="ghost" size="sm" onClick={generateTitles}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Régénérer
            </Button>
          </div>
          <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
            {titles.map((t, i) => (
              <button
                key={i}
                onClick={() => selectTitle(t.title)}
                className="text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <p className="font-medium text-sm">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
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
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-sm">
              Titre choisi : <span className="font-semibold">{chosenTitle}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={generateProgram} size="sm">
              <Sparkles className="w-4 h-4 mr-1" />
              Générer le programme complet
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newData = { ...playData, chosen_title: null };
                onDataUpdate(newData);
              }}
            >
              Changer de titre
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Show generated program */}
      {chosenTitle && program && !generating && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-sm font-semibold">{chosenTitle}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={generateProgram}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Régénérer
            </Button>
          </div>

          {/* Challenge: days */}
          {isChallenge && Array.isArray((program as any).days) && (
            <div className="space-y-3">
              {((program as any).days as any[]).map((day: any) => (
                <Card key={day.day} className="p-3 bg-white">
                  <p className="font-semibold text-sm">
                    Jour {day.day} : {day.theme}
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
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{sec.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {sec.duration_minutes} min
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{sec.content}</p>
                  {sec.engagement_tip && (
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      {sec.engagement_tip}
                    </p>
                  )}
                </Card>
              ))}
              {(program as any).total_duration_minutes && (
                <p className="text-xs text-muted-foreground text-right">
                  Durée totale : ~{(program as any).total_duration_minutes} min
                </p>
              )}
            </div>
          )}

          {/* Bonus ideas */}
          {Array.isArray((program as any).bonus_ideas) && (program as any).bonus_ideas.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Idées de bonus</p>
              <ul className="space-y-1">
                {((program as any).bonus_ideas as string[]).map((b, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">*</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Offer pitch tips */}
          {Array.isArray((program as any).offer_pitch_tips) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Conseils pour pitcher l&apos;offre
              </p>
              <ul className="space-y-1">
                {((program as any).offer_pitch_tips as string[]).map((t, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-green-600 mt-0.5">*</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Promo strategies */}
          {Array.isArray((program as any).promo_strategies) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Stratégies de promo
              </p>
              <ul className="space-y-1">
                {((program as any).promo_strategies as string[]).map((s, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-orange-600 mt-0.5">*</span>
                    {s}
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

  const eventLabel = isChallenge ? "challenge" : "webinaire";

  function buildCreateUrl(action: { type: string; promptPrefix: string }) {
    const title = webinar.title || "";
    const topic = webinar.topic || "";
    const prompt = `${action.promptPrefix} "${title}"${topic ? ` sur le thème : ${topic}` : ""}`;
    return `/create/${action.type}?template=event&prompt=${encodeURIComponent(prompt)}`;
  }

  return (
    <div className="space-y-4">
      {/* AI Generator */}
      <PlaybookAIGenerator
        webinar={webinar}
        onDataUpdate={onPlaybookDataUpdate}
      />

      {/* Overall progress */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">Progression du playbook</p>
          <Badge variant={overallPct === 100 ? "default" : "outline"}>
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
          const phaseLabel = isChallenge
            ? PHASE_LABELS[phaseId]?.labelChallenge || PHASE_LABELS[phaseId]?.label || phaseId
            : PHASE_LABELS[phaseId]?.label || phaseId;

          return (
            <AccordionItem key={phaseId} value={phaseId} className="border rounded-lg mb-2 px-1">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3 flex-1">
                  <Icon className={`w-5 h-5 ${phase.color}`} />
                  <span className="font-semibold text-sm">{phaseLabel}</span>
                  <Badge
                    variant={phasePct === 100 ? "default" : "outline"}
                    className="ml-auto mr-2 text-[10px]"
                  >
                    {comp.done}/{comp.total}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pl-8">
                  {/* Tips */}
                  {phase.tips.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" />
                        Conseils
                      </p>
                      {phase.tips.map((tip, i) => (
                        <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                          <span className="shrink-0 mt-0.5">-</span>
                          {tip}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Checklist items */}
                  <div className="space-y-2">
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
                            className={`text-sm cursor-pointer ${
                              progress[item.key] ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {item.label}
                          </label>
                          {item.generateAction && (
                            <a
                              href={buildCreateUrl(item.generateAction)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                            >
                              <Sparkles className="w-3 h-3" />
                              Générer avec l&apos;IA
                              <ExternalLink className="w-2.5 h-2.5" />
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
