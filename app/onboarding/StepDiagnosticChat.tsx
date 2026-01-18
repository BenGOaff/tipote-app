"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { OnboardingData } from "./OnboardingFlow";

type ChatRole = "assistant" | "user";

export type DiagnosticTurn = {
  role: ChatRole;
  content: string;
  created_at: string;
  quality_score?: number;
  tags?: string[];
};

export type DiagnosticPayload = {
  diagnostic_answers: DiagnosticTurn[];
  diagnostic_profile: Record<string, unknown>;
  diagnostic_summary: string;
  diagnostic_completed: boolean;
  onboarding_version: string;
};

interface StepDiagnosticChatProps {
  data: OnboardingData;
  onBack: () => void;
  onComplete: (payload: DiagnosticPayload) => void;
  isSubmitting: boolean;
}

type Question = {
  id: string;
  title: string;
  prompt: (firstName: string) => string;
  minChars: number;
  followUp?: (firstName: string, lastAnswer: string) => string;
  tags?: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function randomDelayMs() {
  return 800 + Math.floor(Math.random() * 1000);
}

function maybeName(firstName: string) {
  if (!firstName) return "";
  return Math.random() < 0.55 ? ` ${firstName}` : "";
}

function scoreAnswer(text: string, minChars: number) {
  const t = (text ?? "").trim();
  if (!t) return 0;

  const lenScore = Math.min(1, t.length / Math.max(minChars, 1));
  const hasExample = /ex(emple)?|par exemple|ex\s?:|genre|j'ai|j’ai|on a|on a essayé|j'ai essayé|j’ai essayé/i.test(t);
  const hasNumbers = /\d/.test(t);
  const hasCause = /parce que|car|du coup|donc|résultat|au lieu de|à cause de/i.test(t);
  const hasConcrete = /(€|\/mois|clients?|ventes?|rdv|leads?|followers?|emails?|%)/i.test(t);

  const richness =
    (hasExample ? 0.15 : 0) +
    (hasNumbers ? 0.1 : 0) +
    (hasCause ? 0.1 : 0) +
    (hasConcrete ? 0.1 : 0);

  return Math.max(0, Math.min(1, lenScore * 0.7 + richness));
}

function compactLines(s: string) {
  return (s ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n");
}

function getAnswerByQuestionId(turns: DiagnosticTurn[], id: string) {
  const tag = `q:${id}`;
  const t = turns.find((x) => x.role === "user" && (x.tags ?? []).includes(tag));
  return (t?.content ?? "").trim();
}

function buildDiagnosticProfile(turns: DiagnosticTurn[], data: OnboardingData): Record<string, unknown> {
  const userText = turns
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("\n\n")
    .toLowerCase();

  const rootBlockers: string[] = [];
  if (/impost|crédib|légitim/i.test(userText)) rootBlockers.push("credibility_fear");
  if (/temps|débord|surcharg|fatigu|énergie/i.test(userText)) rootBlockers.push("time_energy_constraints");
  if (/argent|budget|invest|endett|trésorer/i.test(userText)) rootBlockers.push("money_constraints");
  if (/peur|anxi|stress|panique|bloqu|évite|procrast/i.test(userText)) rootBlockers.push("fear_avoidance");
  if (/offre|positionn|niche|cibl|promesse|avatar/i.test(userText)) rootBlockers.push("offer_clarity");
  if (/trafic|audience|abonn|visibil|algorithm|contenu/i.test(userText)) rootBlockers.push("traffic_audience");
  if (/vente|clos|conversion|prospect|client|objection/i.test(userText)) rootBlockers.push("sales_conversion");

  const constraints = {
    weekly_hours: data.weeklyHours || null,
    revenue_goal_monthly: (data as any).revenueGoalMonthly || null,
    non_negotiables: getAnswerByQuestionId(turns, "non_negotiables") || null,
    personal_constraints: getAnswerByQuestionId(turns, "constraints") || null,
  };

  const horizon = {
    d30: getAnswerByQuestionId(turns, "30d_win") || null,
    d90: getAnswerByQuestionId(turns, "90d_target") || null,
    m12: getAnswerByQuestionId(turns, "12m_vision") || null,
    y3_5: getAnswerByQuestionId(turns, "3y_vision") || null,
  };

  const client = {
    ideal_client_real_desire: getAnswerByQuestionId(turns, "ideal_client") || null,
    triggers_now: getAnswerByQuestionId(turns, "client_triggers") || null,
    objections: getAnswerByQuestionId(turns, "client_objections") || null,
  };

  const differentiation = {
    proof_or_method: getAnswerByQuestionId(turns, "differentiation") || null,
    anti_competitors_sentence: getAnswerByQuestionId(turns, "anti_competitors") || null,
  };

  const toneEnergy = {
    tone_preference_raw: getAnswerByQuestionId(turns, "tone_style") || null,
    formats_doable: getAnswerByQuestionId(turns, "formats_doable") || null,
    formats_impossible: getAnswerByQuestionId(turns, "formats_impossible") || null,
  };

  const nextMove = {
    focus_14_days: getAnswerByQuestionId(turns, "next_move") || null,
    deliverable_14_days: getAnswerByQuestionId(turns, "deliverable_14_days") || null,
  };

  return {
    version: "v2_min_form+chat",
    root_blockers: Array.from(new Set(rootBlockers)).slice(0, 8),

    // from form (ancrages)
    profile: {
      first_name: data.firstName || null,
      country: data.country || null,
      niche: data.niche || null,
      mission_statement: data.missionStatement || null,
      main_goal_90_days: data.mainGoal90Days || null,
      has_offers: data.hasOffers ?? null,
      offers: data.offers ?? [],
      social_links: data.socialLinks ?? [],
      client_feedback: (data.clientFeedback ?? []).filter(Boolean),
    },

    constraints,
    horizon,
    client,
    differentiation,
    tone_energy: toneEnergy,
    next_move: nextMove,

    raw_signals: {
      biggest_blocker_form: data.biggestBlocker || null,
      maturity_form: data.maturity || null,
      biggest_challenge_form: data.biggestChallenge || null,
      unique_value_form: data.uniqueValue || null,
      untapped_strength_form: data.untappedStrength || null,
    },
  };
}

function buildSummary(turns: DiagnosticTurn[], data: OnboardingData) {
  const points: string[] = [];
  const userAnswers = turns.filter((t) => t.role === "user").map((t) => t.content.trim());
  userAnswers.slice(-10).forEach((a, i) => {
    points.push(`- Point ${i + 1} : ${a}`);
  });

  const meta: string[] = [];
  if (data.missionStatement) meta.push(`Mission : ${data.missionStatement}`);
  if (data.mainGoal90Days) meta.push(`Objectif 90 jours (form) : ${data.mainGoal90Days}`);
  if ((data as any).revenueGoalMonthly) meta.push(`Objectif CA mensuel : ${(data as any).revenueGoalMonthly}`);
  if (data.weeklyHours) meta.push(`Temps dispo : ${data.weeklyHours}/semaine`);

  return compactLines([meta.length ? meta.join(" · ") : "", "", "Synthèse du diagnostic :", ...points].join("\n")).slice(
    0,
    4000,
  );
}

export function StepDiagnosticChat({ data, onBack, onComplete, isSubmitting }: StepDiagnosticChatProps) {
  const firstName = (data.firstName || "").trim();

  const questions: Question[] = useMemo(
    () => [
      {
        id: "today_reality",
        title: "Situation réelle",
        prompt: (n) =>
          `Ok${maybeName(n)}. Avant de te proposer une stratégie, j’ai besoin de ta réalité.\n\nDécris où tu en es aujourd’hui : ce que tu as déjà tenté, et ce qui te bloque VRAIMENT.`,
        minChars: 120,
        followUp: (n) =>
          `Ok${maybeName(n)}. Donne-moi 2–3 exemples concrets (actions faites, durée, résultat). Même si le résultat est nul.`,
        tags: ["context", "history"],
      },
      {
        id: "root_blocker",
        title: "Blocage racine",
        prompt: (n) =>
          `Hmmm${maybeName(n)}… si tu devais choisir UNE seule cause racine (pas le symptôme), ce serait quoi ?\n\nEt pourquoi ?`,
        minChars: 110,
        followUp: (n) =>
          `Je veux être sûre de bien comprendre${maybeName(n)} : raconte une situation précise où tu t’es retrouvée bloquée, et ce que tu t’es dit à ce moment-là.`,
        tags: ["blocker", "root_cause"],
      },
      {
        id: "constraints",
        title: "Contraintes & limites",
        prompt: (n) =>
          `Niveau contraintes${maybeName(n)} : quelles sont tes limites réelles (temps/énergie/budget/situation perso/compétences) ?\n\nDis-moi ce qui est NON négociable.`,
        minChars: 110,
        followUp: (n) =>
          `Si tu devais classer tes contraintes (1 = la plus forte)${maybeName(n)}, ce serait quoi ? Et pourquoi ?`,
        tags: ["constraints"],
      },
      {
        id: "non_negotiables",
        title: "Ce que tu refuses",
        prompt: (n) =>
          `Qu’est-ce que tu refuses de faire, même si “ça marche”${maybeName(n)} ?\n\n(ex: DM, appels, vidéo, pub, poster tous les jours, etc.)`,
        minChars: 60,
        followUp: (n) =>
          `Ok${maybeName(n)}. Donne-moi 2 choses que tu acceptes de faire, et 2 choses impossibles pour toi (même avec de la volonté).`,
        tags: ["boundaries"],
      },
      {
        id: "30d_win",
        title: "Horizon 30 jours",
        prompt: (n) =>
          `Dans 30 jours${maybeName(n)}, ce serait déjà une victoire si…\n\n(un résultat concret, mesurable, même petit)`,
        minChars: 60,
        followUp: (n, last) =>
          `Ok${maybeName(n)}. Si tu devais le rendre mesurable : tu mesurerais quoi exactement ? (ex: 10 leads, 3 ventes, 1 page en ligne, 5 contenus, etc.)`,
        tags: ["goal", "horizon"],
      },
      {
        id: "90d_target",
        title: "Horizon 90 jours (moteur)",
        prompt: (n) =>
          `Et dans 90 jours${maybeName(n)} : tu veux obtenir quoi EXACTEMENT ?\n\n(résultat + chiffre + preuve que c’est réel)`,
        minChars: 80,
        followUp: (n) =>
          `Qu’est-ce qui ferait que tu te dirais “OK, ça avance” dans 7 jours${maybeName(n)} ? (un signal clair)`,
        tags: ["goal", "metrics"],
      },
      {
        id: "12m_vision",
        title: "Vision 12 mois",
        prompt: (n) => `Dans 12 mois${maybeName(n)}, tu veux que ton business ressemble à quoi ? (1 phrase claire)`,
        minChars: 35,
        followUp: (n) => `Ok${maybeName(n)}. Si tu devais choisir 1 indicateur qui prouve que tu y es, ce serait quoi ?`,
        tags: ["vision"],
      },
      {
        id: "3y_vision",
        title: "Vision 3–5 ans",
        prompt: (n) => `À 3–5 ans${maybeName(n)}, c’est quoi la vision ? (1 phrase)`,
        minChars: 25,
        followUp: (n) => `Ok${maybeName(n)}. Qu’est-ce que tu veux éviter à tout prix dans cette vision ?`,
        tags: ["vision_long"],
      },
      {
        id: "ideal_client",
        title: "Client idéal (réel)",
        prompt: (n) =>
          `Parlons client idéal${maybeName(n)}.\n\nIl veut quoi VRAIMENT dans sa vie ? (pas “aligné” — concrètement, ça lui apporte quoi ?)`,
        minChars: 110,
        followUp: (n) =>
          `Ok${maybeName(n)}. Décris une journée-type de ce client quand le problème n’est PAS résolu (ce qu’il vit, ce qu’il se répète, ce qu’il évite).`,
        tags: ["persona", "desire"],
      },
      {
        id: "client_triggers",
        title: "Déclencheurs d’achat",
        prompt: (n) =>
          `Qu’est-ce qui le ferait acheter MAINTENANT${maybeName(n)} plutôt que “plus tard” ?\n\n(urgence, déclic, peur, opportunité, événement…)`,
        minChars: 90,
        followUp: (n) =>
          `Ok${maybeName(n)}. Donne-moi 2 signaux/phrases qu’il pourrait dire au moment où il passe à l’action.`,
        tags: ["persona", "triggers"],
      },
      {
        id: "client_objections",
        title: "Objections",
        prompt: (n) =>
          `Avant d’acheter, quelles sont ses 3 objections principales${maybeName(n)} ?\n\n(et ce qu’il se raconte pour justifier qu’il n’achète pas)`,
        minChars: 100,
        followUp: (n) =>
          `Ok${maybeName(n)}. Parmi ces objections, laquelle revient TOUT LE TEMPS ? Et pourquoi ?`,
        tags: ["persona", "objections"],
      },
      {
        id: "differentiation",
        title: "Différenciation concrète",
        prompt: (n) =>
          `Qu’est-ce qui te différencie VRAIMENT${maybeName(n)} ?\n\nPas une phrase marketing : une preuve, une méthode, un angle, une expérience, un résultat vérifiable.`,
        minChars: 110,
        followUp: (n) =>
          `Super${maybeName(n)}. Si je devais résumer ta différence en 1 phrase “anti-concurrents”, tu écrirais quoi ?`,
        tags: ["differentiation"],
      },
      {
        id: "anti_competitors",
        title: "Phrase anti-concurrents",
        prompt: (n) =>
          `Écris ta phrase “anti-concurrents”${maybeName(n)} en mode simple (pas de jargon).\n\nEx: “Je fais X pour Y sans Z.”`,
        minChars: 60,
        followUp: (n, last) =>
          `Ok${maybeName(n)}. Maintenant rends-la encore plus concrète : remplace “X/Y/Z” par des mots que ton client utilise vraiment.`,
        tags: ["differentiation"],
      },
      {
        id: "tone_style",
        title: "Style & ton",
        prompt: (n) =>
          `Dernier point${maybeName(n)} : tu veux un ton plutôt… direct / bienveillant / punchy / provoc / très pro ?\n\nEt tu préfères écrire ou parler ?`,
        minChars: 70,
        followUp: (n) =>
          `Ok${maybeName(n)}. Donne-moi 2 mots qui décrivent ton style naturel, et 2 mots qui te donnent envie de fuir.`,
        tags: ["tone", "style"],
      },
      {
        id: "formats_doable",
        title: "Formats tenables",
        prompt: (n) =>
          `Quels sont 2 formats que tu peux tenir 30 jours sans te détester${maybeName(n)} ?\n\n(ex: 3 posts/semaine, 1 email/jour, 1 live/semaine, 2 vidéos/semaine…)`,
        minChars: 70,
        followUp: (n) =>
          `Ok${maybeName(n)}. Et le format le PLUS efficace selon toi (même s’il fait peur), ce serait lequel ?`,
        tags: ["formats"],
      },
      {
        id: "formats_impossible",
        title: "Formats impossibles",
        prompt: (n) =>
          `Et à l’inverse${maybeName(n)} : quels sont 2 formats impossibles pour toi (même si “ça marche”) ?`,
        minChars: 50,
        followUp: (n) =>
          `Ok${maybeName(n)}. C’est noté. Je te construirai un plan qui n’implique pas ça.`,
        tags: ["formats", "boundaries"],
      },
      {
        id: "next_move",
        title: "Prochain mouvement (14 jours)",
        prompt: (n) =>
          `Si on devait faire UN seul focus les 14 prochains jours${maybeName(n)} pour débloquer ton business, ce serait quoi ?\n\nEt pourquoi celui-là plutôt qu’un autre ?`,
        minChars: 110,
        followUp: (n) =>
          `Ok${maybeName(n)}. Décris le livrable final au bout de 14 jours (ex: une offre, une page, 10 contenus, 5 RDV…).`,
        tags: ["next_move", "plan"],
      },
      {
        id: "deliverable_14_days",
        title: "Livrable 14 jours",
        prompt: (n) =>
          `Décris le livrable final au bout de 14 jours${maybeName(n)}.\n\nQu’est-ce qui existe concrètement à la fin ?`,
        minChars: 80,
        followUp: (n) =>
          `Ok${maybeName(n)}. Si tu avais 2 heures demain, tu fais quoi en premier ?`,
        tags: ["next_move", "deliverable"],
      },
    ],
    [],
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [turns, setTurns] = useState<DiagnosticTurn[]>(() => [
    {
      role: "assistant",
      content:
        `On va faire un mini diagnostic (≈ ${questions.length} questions). Je te pose 1 question à la fois.\n\n` +
        `Réponds de façon la plus concrète possible : exemples, chiffres, contexte. Ça me permettra de te générer un plan + des tâches vraiment pertinents.`,
      created_at: nowIso(),
      tags: ["intro"],
    },
  ]);

  const [qIndex, setQIndex] = useState(0);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const [input, setInput] = useState("");
  const [askedFollowUpFor, setAskedFollowUpFor] = useState<Record<string, boolean>>({});

  // typing simulation
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const pendingTextRef = useRef<string>("");
  const pendingTagsRef = useRef<string[] | undefined>(undefined);

  const currentQ = questions[qIndex];
  const done = qIndex >= questions.length;

  // Scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, isTyping]);

  useEffect(() => {
    if (awaitingAnswer) inputRef.current?.focus();
  }, [awaitingAnswer]);

  function pushTurn(t: DiagnosticTurn) {
    setTurns((prev) => [...prev, t]);
  }

  function pushAssistantNow(content: string, tags?: string[]) {
    pushTurn({ role: "assistant", content, created_at: nowIso(), tags });
  }

  function pushAssistant(content: string, tags?: string[], withDelay = true) {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    pendingTextRef.current = content;
    pendingTagsRef.current = tags;

    if (!withDelay) {
      setIsTyping(false);
      pushAssistantNow(content, tags);
      pendingTextRef.current = "";
      pendingTagsRef.current = undefined;
      return;
    }

    setIsTyping(true);
    typingTimeoutRef.current = window.setTimeout(() => {
      pushAssistantNow(content, tags);
      setIsTyping(false);
      pendingTextRef.current = "";
      pendingTagsRef.current = undefined;
      typingTimeoutRef.current = null;
    }, randomDelayMs());
  }

  function skipTyping() {
    if (!isTyping) return;
    const text = pendingTextRef.current;
    if (!text) return;

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    setIsTyping(false);
    pushAssistantNow(text, pendingTagsRef.current);
    pendingTextRef.current = "";
    pendingTagsRef.current = undefined;
  }

  useEffect(() => {
    // intro déjà ajouté dans state init
    // première question
    pushAssistant(currentQ.prompt(firstName), currentQ.tags, true);
    setAwaitingAnswer(true);

    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushUser(content: string, q: Question) {
    const quality = scoreAnswer(content, q.minChars);

    // tag du tour user avec id de question -> extraction fiable
    const tags = Array.from(
      new Set([...(q.tags ?? []), `q:${q.id}`]),
    );

    pushTurn({ role: "user", content, created_at: nowIso(), quality_score: quality, tags });
    return quality;
  }

  function nextQuestion() {
    const next = qIndex + 1;

    if (next >= questions.length) {
      setQIndex(next);
      setAwaitingAnswer(false);
      pushAssistant(
        `Parfait${maybeName(firstName)}. J’ai tout ce qu’il me faut.\n\nClique sur “Générer ma stratégie” pour que je construise ta pyramide d’offres, ton plan et tes tâches.`,
        ["done"],
        true,
      );
      return;
    }

    setQIndex(next);
    setAwaitingAnswer(true);
    const nq = questions[next];
    pushAssistant(nq.prompt(firstName), nq.tags, true);
  }

  function handleSend() {
    if (isSubmitting) return;

    // si Tipote est en train “d’écrire”, un envoi skip d’abord
    if (isTyping) skipTyping();

    const text = input.trim();
    if (!text || !currentQ) return;

    setInput("");
    const quality = pushUser(text, currentQ);
    setAwaitingAnswer(false);

    const needsFollowUp = quality < 0.62 && !!currentQ.followUp && !askedFollowUpFor[currentQ.id];

    if (needsFollowUp) {
      setAskedFollowUpFor((prev) => ({ ...prev, [currentQ.id]: true }));
      pushAssistant(currentQ.followUp!(firstName, text), ["followup"], true);
      setAwaitingAnswer(true);
      return;
    }

    const feedback =
      quality >= 0.88
        ? `✅ Très clair${maybeName(firstName)}.`
        : quality >= 0.72
          ? `✅ OK${maybeName(firstName)}, je vois.`
          : `✅ Merci${maybeName(firstName)}.`;

    pushAssistant(feedback, ["ack"], true);

    // petite “phrase humaine” de temps en temps
    if (Math.random() < 0.35) {
      pushAssistant(`Super${maybeName(firstName)}, ta réponse va beaucoup m’aider pour la suite 👏`, ["encourage"], true);
    }

    nextQuestion();
  }

  function handleFinish() {
    if (isSubmitting) return;

    const payload: DiagnosticPayload = {
      diagnostic_answers: turns,
      diagnostic_profile: buildDiagnosticProfile(turns, data),
      diagnostic_summary: buildSummary(turns, data),
      diagnostic_completed: true,
      onboarding_version: "v2_min_form+chat",
    };

    onComplete(payload);
  }

  const progress = Math.min(
    100,
    Math.round(((Math.min(qIndex, questions.length) + 1) / (questions.length + 1)) * 100),
  );

  return (
    <Card className="p-6 md:p-8 shadow-lg bg-white/80 backdrop-blur-sm border-0">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Diagnostic</h2>
            <p className="text-muted-foreground">
              {done ? "Terminé" : `Question ${Math.min(qIndex + 1, questions.length)} / ${questions.length}`} ·{" "}
              <span className="font-medium">{progress}%</span>
            </p>

            {!done && currentQ?.title ? (
              <div className="mt-2">
                <Badge variant="secondary" className="rounded-full">
                  {currentQ.title}
                </Badge>
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="ghost" onClick={onBack} disabled={isSubmitting} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>

      <div
        ref={scrollerRef}
        className="h-[420px] md:h-[480px] overflow-y-auto rounded-2xl border bg-background/60 p-4 md:p-5 space-y-3"
        onClick={skipTyping}
        role="button"
        tabIndex={0}
      >
        {turns.map((t, idx) => {
          const isUser = t.role === "user";
          const bubble = (
            <div
              className={cn(
                "max-w-[92%] md:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                isUser ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted text-foreground",
              )}
            >
              {t.content}
            </div>
          );

          const quality =
            isUser && typeof t.quality_score === "number" ? (
              <div className={cn("mt-1 text-xs", isUser ? "text-right" : "text-left")}>
                <span className="text-muted-foreground">Qualité : {Math.round(t.quality_score * 100)}%</span>
              </div>
            ) : null;

          return (
            <div key={idx} className={cn("space-y-1", isUser ? "text-right" : "text-left")}>
              {bubble}
              {quality}
            </div>
          );
        })}

        {isTyping ? (
          <div className="space-y-1 text-left">
            <div className={cn("max-w-[92%] md:max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-muted text-foreground")}>
              <span className="inline-flex items-center gap-2">
                <span className="text-muted-foreground">Tipote écrit…</span>
                <span className="inline-flex gap-1">
                  <span className="animate-bounce">•</span>
                  <span className="animate-bounce [animation-delay:120ms]">•</span>
                  <span className="animate-bounce [animation-delay:240ms]">•</span>
                </span>
              </span>
              <div className="mt-2 text-xs text-muted-foreground">Clique pour afficher tout de suite</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {!done ? (
          <>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ta réponse… (plus tu es concrète, plus Tipote sera précis)"
              disabled={isSubmitting || !awaitingAnswer}
              className="min-h-[92px] rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Astuce : exemples, chiffres, contexte, objections… c’est ça qui rend le plan “coach-level”.
              </p>
              <Button onClick={handleSend} disabled={isSubmitting || !awaitingAnswer || !input.trim()} className="rounded-xl">
                Envoyer
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Diagnostic complété. On peut générer ta stratégie.</span>
            </div>
            <Button onClick={handleFinish} disabled={isSubmitting} className="rounded-xl">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération…
                </>
              ) : (
                "Générer ma stratégie"
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default StepDiagnosticChat;
