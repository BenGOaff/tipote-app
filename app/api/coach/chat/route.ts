// app/api/coach/chat/route.ts
// Coach IA premium (Pro/Elite) : chat court + contextuel + prêt pour suggestions/actions.
// ✅ Mémoire longue durée : facts/tags + last session depuis public.coach_messages
// ✅ Contexte "vivant" : résumé court + métriques + offre sélectionnée + "what changed since last time"
// ✅ Micro-réponses : hard limit (3–10 lignes) + mode "go deeper"
// ✅ A6: Gating Free/Basic propre + 1 message teaser / mois (option)
// ✅ A1.4: "Decision tracker" (tests 14 jours -> check-in auto "verdict ?")
// ✅ A4 (partiel): Tipote-knowledge first (RAG simple) via lib/resources.ts (no internet yet)
// ✅ Contrat fort suggestions côté /chat (sanitization stricte)
// ✅ Remontée refus + dernière action appliquée via memoryBlock (facts: rejected_suggestions / applied_suggestion)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { buildCoachSystemPrompt } from "@/lib/prompts/coach/system";
import { searchResourceChunks, type ResourceChunkMatch } from "@/lib/resources";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BodySchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(4000),
        }),
      )
      .max(20)
      .optional(),
  })
  .strict();

type StoredPlan = "free" | "basic" | "pro" | "elite" | "beta";

type CoachSuggestionType = "update_offers" | "update_tasks" | "open_tipote_tool";

type CoachSuggestion = {
  id: string;
  type: CoachSuggestionType;
  title: string;
  description?: string;
  payload?: Record<string, unknown>;
};

const SuggestionSchema = z
  .object({
    id: z.string().trim().min(1).max(128).optional(),
    type: z.enum(["update_offers", "update_tasks", "open_tipote_tool"]),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(800).optional(),
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

function sanitizeSuggestions(raw: unknown, opts: { isTeaser: boolean }): CoachSuggestion[] {
  if (opts.isTeaser) return [];
  if (!Array.isArray(raw)) return [];

  const out: CoachSuggestion[] = [];
  const makeId = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const uuidLike = (v: unknown) => typeof v === "string" && /^[0-9a-fA-F-]{16,64}$/.test(v.trim());
  const isIsoDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

  for (const item of raw.slice(0, 6)) {
    const parsed = SuggestionSchema.safeParse(item);
    if (!parsed.success) continue;

    const s = parsed.data;
    const payload = (s.payload ?? {}) as Record<string, unknown>;

    // Validate per-type payload contract (safe)
    if (s.type === "update_tasks") {
      const taskId = (payload as any).task_id ?? (payload as any).id;
      if (!uuidLike(taskId)) continue;

      const next: Record<string, unknown> = { task_id: String(taskId) };

      if (typeof (payload as any).title === "string" && (payload as any).title.trim()) {
        next.title = String((payload as any).title).trim().slice(0, 240);
      }

      const st = String((payload as any).status ?? "").trim();
      if (st) {
        const low = st.toLowerCase();
        if (!["todo", "in_progress", "blocked", "done"].includes(low)) continue;
        next.status = low;
      }

      if ((payload as any).due_date === null) {
        next.due_date = null;
      } else if (typeof (payload as any).due_date === "string" && (payload as any).due_date.trim()) {
        const d = String((payload as any).due_date).trim();
        if (!isIsoDate(d)) continue;
        next.due_date = d;
      }

      if ("priority" in payload) {
        const p = (payload as any).priority;
        next.priority = typeof p === "string" ? p.trim().slice(0, 48) || null : null;
      }

      if ("timeframe" in payload) {
        const tf = (payload as any).timeframe;
        next.timeframe = typeof tf === "string" ? tf.trim().slice(0, 48) || null : null;
      }

      out.push({
        id: s.id || makeId(),
        type: "update_tasks",
        title: s.title,
        ...(s.description ? { description: s.description } : {}),
        payload: next,
      });
    } else if (s.type === "update_offers") {
      const idx = (payload as any).selectedIndex ?? (payload as any).selected_index;
      const pyramid = (payload as any).pyramid ?? (payload as any).selected_offer_pyramid;
      if (typeof idx !== "number" || !Number.isFinite(idx) || idx < 0) continue;
      if (typeof pyramid !== "object" || pyramid === null || Array.isArray(pyramid)) continue;

      const p = pyramid as any;
      if (typeof p.name !== "string" || !p.name.trim()) continue;
      // Minimum structurel: au moins un niveau présent
      if (!("lead_magnet" in p) && !("low_ticket" in p) && !("high_ticket" in p)) continue;

      out.push({
        id: s.id || makeId(),
        type: "update_offers",
        title: s.title,
        ...(s.description ? { description: s.description } : {}),
        payload: { selectedIndex: idx, pyramid: p as any },
      });
    } else if (s.type === "open_tipote_tool") {
      const path = (payload as any).path;
      if (typeof path !== "string") continue;
      const clean = path.trim();
      if (!clean.startsWith("/")) continue;

      out.push({
        id: s.id || makeId(),
        type: "open_tipote_tool",
        title: s.title,
        ...(s.description ? { description: s.description } : {}),
        payload: { path: clean.slice(0, 240) },
      });
    }

    // UX: on limite à 2 suggestions max pour rester “premium” et actionnable
    if (out.length >= 2) break;
  }

  return out;
}

function normalizePlan(plan: string | null | undefined): StoredPlan {
  const s = String(plan ?? "").trim().toLowerCase();
  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("beta")) return "beta";
  if (s.includes("pro")) return "pro";
  if (s.includes("essential")) return "pro";
  if (s.includes("basic")) return "basic";
  return "free";
}

function safeLocale(v: unknown): "fr" | "en" {
  const s = String(v ?? "").toLowerCase();
  return s.startsWith("en") ? "en" : "fr";
}

async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model =
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 1200,
      temperature: typeof args.temperature === "number" ? args.temperature : 0.6,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  const text = parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "";
}

function formatKnowledgeBlock(chunks: ResourceChunkMatch[]) {
  const cleaned = (chunks ?? [])
    .map((c) => {
      const text = String(c.content ?? "").trim();
      const sim = typeof c.similarity === "number" ? c.similarity : null;
      const title = `resource:${c.resource_id}#${c.chunk_index}`;
      if (!text) return null;
      return { text, sim, title };
    })
    .filter(Boolean) as Array<{ text: string; sim: number | null; title: string }>;

  if (!cleaned.length) return "";

  const lines: string[] = [];
  lines.push("TIPOTE-KNOWLEDGE (internal, prioritized):");
  cleaned.slice(0, 6).forEach((c, i) => {
    const header = c.title ? `${i + 1}) ${c.title}` : `${i + 1})`;
    const sim = c.sim !== null ? ` (sim ${c.sim.toFixed(2)})` : "";
    lines.push(`${header}${sim}`);
    lines.push(c.text.slice(0, 900));
    lines.push("");
  });

  return lines.join("\n").trim();
}

async function safeSearchTipoteKnowledge(query: string) {
  try {
    const res = await searchResourceChunks({
      query,
      matchCount: 6,
      matchThreshold: 0.55,
    });
    return Array.isArray(res) ? res : [];
  } catch {
    // Best-effort: si embeddings / RPC pas dispo => pas de bloc knowledge
    return [];
  }
}

type CoachMemory = {
  summary_tags: string[];
  facts: Record<string, unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pushTag(tags: Set<string>, tag: string) {
  const t = String(tag || "").trim().toLowerCase();
  if (!t) return;
  tags.add(t.slice(0, 64));
}

function extractGoalEuros(text: string): string | null {
  const s = text.toLowerCase();
  const m1 = s.match(/\b(\d{1,3})\s?k\b/);
  if (m1?.[1]) return `${m1[1]}k`;
  const m2 = s.match(/\b(\d{2,3})\s?\.?\s?0{3}\b/);
  if (m2?.[0]) return m2[0].replace(/\s|\./g, "");
  const m3 = s.match(/\b(\d{1,6})\s?€\b/);
  if (m3?.[1]) return m3[1];
  return null;
}

type CoachExperiment = {
  id: string;
  title: string;
  start_at: string; // ISO
  duration_days: number;
  status: "active" | "completed" | "abandoned";
};

function uidLite() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseDurationDays(text: string): number | null {
  const s = text.toLowerCase();

  const mDays = s.match(/\b(\d{1,3})\s*(jour|jours)\b/);
  if (mDays?.[1]) {
    const n = Number(mDays[1]);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : null;
  }

  const mWeeks = s.match(/\b(\d{1,2})\s*(semaine|semaines)\b/);
  if (mWeeks?.[1]) {
    const n = Number(mWeeks[1]);
    const d = n * 7;
    return Number.isFinite(d) && d > 0 ? Math.min(d, 365) : null;
  }

  return null;
}

function extractExperimentTitle(text: string): string | null {
  const m = text.match(/\b(tester|test|expérimenter|experimenter)\b\s+([\s\S]{0,120})/i);
  if (!m?.[2]) return null;

  let t = m[2]
    .replace(/\b(pendant|sur)\b[\s\S]*$/i, "")
    .replace(/[\n\r]+/g, " ")
    .trim();

  t = t.split(/[\.!\?\:]/)[0]?.trim() ?? t;

  if (!t) return null;
  if (t.length > 90) t = t.slice(0, 90).trim();
  return t || null;
}

function parseExperimentFromText(text: string): CoachExperiment | null {
  const duration_days = parseDurationDays(text);
  if (!duration_days) return null;

  const title = extractExperimentTitle(text);
  if (!title) return null;

  if (!/\b(tester|test|expérimenter|experimenter)\b/i.test(text)) return null;

  return {
    id: uidLite(),
    title,
    start_at: new Date().toISOString(),
    duration_days,
    status: "active",
  };
}

function collectExperimentsFromFacts(facts: unknown): CoachExperiment[] {
  if (!isRecord(facts)) return [];
  const arr = (facts as any).experiments;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x: any) => (isRecord(x) ? x : null))
    .filter(Boolean)
    .map((x: any) => {
      const id = typeof x.id === "string" ? x.id : uidLite();
      const title = typeof x.title === "string" ? x.title : "";
      const start_at = typeof x.start_at === "string" ? x.start_at : "";
      const duration_days = typeof x.duration_days === "number" ? x.duration_days : Number(x.duration_days);
      const status = typeof x.status === "string" ? x.status : "active";
      if (!title || !start_at || !Number.isFinite(duration_days) || duration_days <= 0) return null;
      if (status !== "active" && status !== "completed" && status !== "abandoned") return null;
      return { id, title, start_at, duration_days, status } as CoachExperiment;
    })
    .filter(Boolean) as CoachExperiment[];
}

type CoachMessageRow = {
  role: "user" | "assistant";
  content: string;
  summary_tags: string[] | null;
  facts: Record<string, unknown> | null;
  created_at: string;
};

function pickActiveExperiment(rows: CoachMessageRow[]): CoachExperiment | null {
  for (const r of rows) {
    const exps = collectExperimentsFromFacts(r.facts);
    const active = exps.find((e) => e.status === "active");
    if (active) return active;
  }
  return null;
}

function isExperimentDue(exp: CoachExperiment): boolean {
  const start = Date.parse(exp.start_at);
  if (!Number.isFinite(start)) return false;
  const due = start + exp.duration_days * 24 * 60 * 60 * 1000;
  return Date.now() >= due;
}

function deriveMemory(args: {
  userMessage: string;
  assistantMessage: string;
  history?: { role: string; content: string }[];
  contextSnapshot?: Record<string, unknown>;
}): CoachMemory {
  const tags = new Set<string>();
  const facts: Record<string, unknown> = {};

  const merged = [args.userMessage, args.assistantMessage, ...(args.history ?? []).map((h) => h.content)].join("\n");
  const low = merged.toLowerCase();

  if (low.includes("linkedin")) pushTag(tags, "channel_linkedin");
  if (low.includes("instagram")) pushTag(tags, "channel_instagram");
  if (low.includes("tiktok")) pushTag(tags, "channel_tiktok");
  if (low.includes("youtube")) pushTag(tags, "channel_youtube");
  if (low.includes("newsletter") || low.includes("email") || low.includes("e-mail")) pushTag(tags, "channel_email");

  if (low.includes("offre") || low.includes("pricing") || low.includes("prix") || low.includes("tarif"))
    pushTag(tags, "topic_offer");
  if (low.includes("acquisition") || low.includes("prospect") || low.includes("lead"))
    pushTag(tags, "topic_acquisition");
  if (low.includes("vente") || low.includes("clos") || low.includes("closing")) pushTag(tags, "topic_sales");

  if (low.includes("cold call") || low.includes("appel à froid") || low.includes("appels à froid")) {
    facts.aversion = Array.isArray(facts.aversion) ? facts.aversion : [];
    (facts.aversion as any[]).push("cold_call");
    pushTag(tags, "aversion_cold_call");
  }

  const goal = extractGoalEuros(merged);
  if (goal) {
    facts.objectif = goal;
    pushTag(tags, "has_goal");
  }

  const decisionMatch = merged.match(/\b(tester|test|expérimenter|experimenter)\b[\s\S]{0,120}/i);
  if (decisionMatch?.[0]) {
    facts.decision_en_cours = decisionMatch[0].trim().slice(0, 160);
    pushTag(tags, "has_decision");
  }

  const exp = parseExperimentFromText(merged);
  if (exp) {
    facts.experiments = Array.isArray((facts as any).experiments) ? (facts as any).experiments : [];
    (facts.experiments as any[]).unshift(exp);
    pushTag(tags, "has_experiment");
  }

  if (args.contextSnapshot && isRecord(args.contextSnapshot)) {
    facts.context_snapshot = args.contextSnapshot;
    pushTag(tags, "has_context_snapshot");
  }

  return { summary_tags: Array.from(tags), facts };
}

function buildMemoryBlock(rows: CoachMessageRow[]) {
  const tags = new Set<string>();
  const factsMerged: Record<string, unknown> = {};
  let lastAssistant: CoachMessageRow | null = null;
  let lastDecision: string | null = null;
  let lastGoal: string | null = null;

  for (const r of rows) {
    if (!lastAssistant && r.role === "assistant") lastAssistant = r;

    if (Array.isArray(r.summary_tags)) {
      for (const t of r.summary_tags) {
        const s = String(t || "").trim().toLowerCase();
        if (s) tags.add(s.slice(0, 64));
      }
    }

    if (isRecord(r.facts)) {
      for (const [k, v] of Object.entries(r.facts)) {
        if (factsMerged[k] === undefined) factsMerged[k] = v;
      }

      if (!lastDecision && typeof (r.facts as any).decision_en_cours === "string") {
        lastDecision = String((r.facts as any).decision_en_cours).trim() || null;
      }
      if (!lastGoal) {
        const g = (r.facts as any).objectif ?? (r.facts as any).goal;
        if (typeof g === "string") lastGoal = g.trim() || null;
      }
    }
  }

  const lines: string[] = [];

  const tagsArr = Array.from(tags).slice(0, 25);
  if (tagsArr.length) lines.push(`- Tags: ${tagsArr.join(", ")}`);

  if (lastGoal) lines.push(`- Objectif: ${lastGoal}`);
  if (lastDecision) lines.push(`- Dernière décision: ${lastDecision}`);

  const activeExp = pickActiveExperiment(rows);
  if (activeExp) {
    const start = Date.parse(activeExp.start_at);
    const due = Number.isFinite(start) ? start + activeExp.duration_days * 24 * 60 * 60 * 1000 : null;
    const daysLeft = due && Number.isFinite(due) ? Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000)) : null;

    const dueLabel =
      activeExp.status !== "active"
        ? activeExp.status
        : isExperimentDue(activeExp)
          ? "DUE"
          : daysLeft !== null
            ? `${daysLeft}j restants`
            : "en cours";

    lines.push(`- Test en cours: ${activeExp.title} (${activeExp.duration_days}j) — ${dueLabel}`);
  }

  const aversion = (factsMerged as any)?.aversion;
  if (Array.isArray(aversion) && aversion.length) {
    lines.push(`- Aversions: ${aversion.slice(0, 5).join(", ")}`);
  }

  // ✅ Remontée refus + raison (“ok, je ne te repropose pas X, tu as refusé car …”)
  const rejected = (factsMerged as any)?.rejected_suggestions;
  if (Array.isArray(rejected) && rejected.length) {
    const items = rejected
      .map((x: any) => {
        const t = typeof x?.title === "string" ? x.title.trim() : "";
        const ty = typeof x?.type === "string" ? x.type.trim() : "";
        const why = typeof x?.reason === "string" ? x.reason.trim() : "";
        const label = [t || "", ty ? `(${ty})` : "", why ? `— ${why}` : ""].filter(Boolean).join(" ");
        return label.trim();
      })
      .filter(Boolean)
      .slice(0, 3)
      .map((s: string) => s.slice(0, 140));

    if (items.length) lines.push(`- Idées refusées récemment: ${items.join(" | ")}`);
  }

  // ✅ Dernière action appliquée (pour continuité premium)
  const applied = (factsMerged as any)?.applied_suggestion;
  if (isRecord(applied)) {
    const a = applied as any;
    const t = typeof a?.title === "string" ? a.title.trim() : "";
    const ty = typeof a?.type === "string" ? a.type.trim() : "";
    const at = typeof a?.at === "string" ? a.at.trim() : "";
    const why = typeof a?.description === "string" ? a.description.trim() : "";
    const label = [t || "action appliquée", ty ? `(${ty})` : "", at ? `— ${at.slice(0, 10)}` : ""]
      .filter(Boolean)
      .join(" ");
    lines.push(`- Dernière action appliquée: ${label}`.slice(0, 220));
    if (why) lines.push(`  ↳ ${why}`.slice(0, 220));
  }

  const coreFactsKeys = Object.keys(factsMerged).filter(
    (k) => !["aversion", "context_snapshot", "applied_suggestion", "rejected_suggestions"].includes(k),
  );
  if (coreFactsKeys.length) {
    const picked: string[] = [];
    for (const k of coreFactsKeys.slice(0, 10)) {
      const v = (factsMerged as any)[k];
      const vs =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : Array.isArray(v)
              ? v.slice(0, 5).map((x) => String(x)).join(", ")
              : "";
      if (vs) picked.push(`${k}: ${vs}`.slice(0, 160));
    }
    if (picked.length) lines.push(`- Facts: ${picked.join(" | ")}`);
  }

  if (lastAssistant?.content) {
    const d = lastAssistant.created_at ? new Date(lastAssistant.created_at).toISOString().slice(0, 10) : "";
    lines.push("");
    lines.push(`Dernier message coach (${d}):`);
    lines.push(lastAssistant.content.slice(0, 900));
  }

  return lines.join("\n").trim();
}

function detectTopicHints(userMessage: string) {
  const low = userMessage.toLowerCase();
  const hints: string[] = [];

  if (low.includes("email") || low.includes("newsletter") || low.includes("mail") || low.includes("e-mail")) {
    hints.push("Email acquisition : pense lead magnet, landing, CTA, séquence, deliverability.");
  }
  if (low.includes("linkedin")) {
    hints.push("LinkedIn : pense ICP, angle, preuve, DM éthique, cadence.");
  }
  if (low.includes("prix") || low.includes("tarif") || low.includes("pricing")) {
    hints.push("Pricing : pense valeur, offre, preuve, risque perçu, ancrage.");
  }

  return hints;
}

function summarizeLivingContext(args: { businessProfile: any | null; planJson: any | null; tasks: any[]; contents: any[] }) {
  const lines: string[] = [];

  const goal =
    (isRecord(args.planJson) &&
      typeof (args.planJson as any).objectif === "string" &&
      (args.planJson as any).objectif.trim()) ||
    (isRecord(args.businessProfile) &&
      typeof (args.businessProfile as any).goal === "string" &&
      (args.businessProfile as any).goal.trim()) ||
    null;

  const constraints: string[] = [];
  if (isRecord(args.businessProfile)) {
    const bp = args.businessProfile as any;
    if (typeof bp.constraints === "string" && bp.constraints.trim()) constraints.push(bp.constraints.trim().slice(0, 120));
    if (typeof bp.time_per_week === "number") constraints.push(`temps dispo: ${bp.time_per_week}h/sem`);
  }

  let offerTitle: string | null = null;
  let offerTarget: string | null = null;
  let offerPrice: string | null = null;

  const plan = isRecord(args.planJson) ? (args.planJson as any) : null;
  const selected = plan?.selected_offer_pyramid;
  if (isRecord(selected)) {
    offerTitle =
      typeof (selected as any).name === "string"
        ? (selected as any).name
        : typeof (selected as any).title === "string"
          ? (selected as any).title
          : null;
    offerTarget =
      typeof (selected as any).target === "string"
        ? (selected as any).target
        : typeof (selected as any).cible === "string"
          ? (selected as any).cible
          : null;
    offerPrice =
      typeof (selected as any).price === "string"
        ? (selected as any).price
        : typeof (selected as any).pricing === "string"
          ? (selected as any).pricing
          : null;
  }

  const tasksOpen = (args.tasks ?? []).filter((t: any) => String(t?.status ?? "").toLowerCase() !== "done").length;
  const tasksDone = (args.tasks ?? []).filter((t: any) => String(t?.status ?? "").toLowerCase() === "done").length;

  const contentScheduled = (args.contents ?? []).filter((c: any) => String(c?.status ?? "").toLowerCase() === "scheduled")
    .length;
  const contentPublished = (args.contents ?? []).filter((c: any) => String(c?.status ?? "").toLowerCase() === "published")
    .length;

  lines.push("Où l'user en est (résumé):");
  if (goal) lines.push(`- Objectif: ${String(goal).slice(0, 80)}`);
  if (constraints.length) lines.push(`- Contraintes: ${constraints.join(" • ").slice(0, 160)}`);

  if (offerTitle || offerPrice || offerTarget) {
    lines.push(`- Offre sélectionnée: ${[offerTitle, offerPrice, offerTarget].filter(Boolean).join(" — ").slice(0, 180)}`);
  } else {
    lines.push("- Offre sélectionnée: (non définie / à clarifier)");
  }

  lines.push("3 métriques clés:");
  lines.push(`- Tâches: ${tasksOpen} ouvertes / ${tasksDone} terminées (dans l'échantillon récent)`);
  lines.push(`- Contenus: ${contentScheduled} planifiés / ${contentPublished} publiés (dans l'échantillon récent)`);

  const snapshot: Record<string, unknown> = {
    metrics: {
      tasks_open_recent: tasksOpen,
      tasks_done_recent: tasksDone,
      content_scheduled_recent: contentScheduled,
      content_published_recent: contentPublished,
    },
    selected_offer: {
      title: offerTitle,
      price: offerPrice,
      target: offerTarget,
    },
  };

  return { text: lines.join("\n"), snapshot };
}

function diffSnapshots(prev: any, next: any) {
  if (!isRecord(prev) || !isRecord(next)) return "";
  const p = prev as any;
  const n = next as any;

  const lines: string[] = [];
  const pm = isRecord(p.metrics) ? (p.metrics as any) : null;
  const nm = isRecord(n.metrics) ? (n.metrics as any) : null;

  if (pm && nm) {
    const dTasksOpen = (nm.tasks_open_recent ?? 0) - (pm.tasks_open_recent ?? 0);
    const dScheduled = (nm.content_scheduled_recent ?? 0) - (pm.content_scheduled_recent ?? 0);
    const dPublished = (nm.content_published_recent ?? 0) - (pm.content_published_recent ?? 0);

    if (dTasksOpen !== 0) lines.push(`- Tâches ouvertes: ${dTasksOpen > 0 ? "+" : ""}${dTasksOpen}`);
    if (dScheduled !== 0) lines.push(`- Contenus planifiés: ${dScheduled > 0 ? "+" : ""}${dScheduled}`);
    if (dPublished !== 0) lines.push(`- Contenus publiés: ${dPublished > 0 ? "+" : ""}${dPublished}`);
  }

  const po = isRecord(p.selected_offer) ? (p.selected_offer as any) : null;
  const no = isRecord(n.selected_offer) ? (n.selected_offer as any) : null;
  const prevTitle = po ? String(po.title ?? "") : "";
  const nextTitle = no ? String(no.title ?? "") : "";
  if (prevTitle && nextTitle && prevTitle !== nextTitle) {
    lines.push(`- Offre sélectionnée: "${prevTitle}" → "${nextTitle}"`);
  }

  if (!lines.length) return "";
  return ["What changed since last time:", ...lines].join("\n");
}

function enforceLineLimit(text: string, maxLines: number) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const lines = normalized.split(/\r?\n/).map((l) => l.trimEnd());
  if (lines.length <= maxLines) return normalized;

  const cut = lines.slice(0, maxLines);
  cut[maxLines - 1] = "Si tu veux, dis : go deeper.";
  return cut.join("\n").trim();
}

function isGoDeeperMessage(userMessage: string) {
  const s = userMessage.trim().toLowerCase();
  if (s === "go deeper" || s === "go deeper." || s === "godeeper") return true;
  if (s.startsWith("go deeper")) return true;
  if (s.includes("approfondis") || s.includes("vas plus loin")) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, plan, locale, first_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const plan = normalizePlan((profileRow as any)?.plan);
    const locale = safeLocale((profileRow as any)?.locale);

    // ✅ Gating + teaser (Free/Basic)
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    let isTeaser = false;

    if (plan !== "pro" && plan !== "elite" && plan !== "beta") {
      let usedQuery = supabase
        .from("coach_messages")
        .select("id")
        .eq("user_id", user.id);
      if (projectId) usedQuery = usedQuery.eq("project_id", projectId);
      const usedRes = await usedQuery
        .contains("facts", { teaser_month: monthKey })
        .limit(1);

      const alreadyUsed = Array.isArray(usedRes.data) && usedRes.data.length > 0;

      if (alreadyUsed) {
        return NextResponse.json(
          {
            ok: false,
            code: "COACH_LOCKED",
            error:
              "Le coach premium est dispo sur les plans Pro et Elite. (Astuce : tu as 1 message teaser / mois en Free/Basic — reviens le mois prochain ou upgrade pour un accès illimité.)",
          },
          { status: 403 },
        );
      }

      isTeaser = true;
    }

    const history = parsed.data.history ?? [];
    const userMessage = parsed.data.message;
    const goDeeper = !isTeaser && isGoDeeperMessage(userMessage);

    let memoryQuery = supabase
      .from("coach_messages")
      .select("role, content, summary_tags, facts, created_at")
      .eq("user_id", user.id);
    if (projectId) memoryQuery = memoryQuery.eq("project_id", projectId);
    const memoryRes = await memoryQuery
      .order("created_at", { ascending: false })
      .limit(30);

    const memoryRows = (memoryRes.data ?? []) as CoachMessageRow[];
    const memoryBlock = memoryRows.length ? buildMemoryBlock(memoryRows) : "";

    let lastSnapshot: any = null;
    for (const r of memoryRows) {
      if (isRecord(r.facts) && isRecord((r.facts as any).context_snapshot)) {
        lastSnapshot = (r.facts as any).context_snapshot;
        break;
      }
    }

    const bpQuery = supabase.from("business_profiles").select("*").eq("user_id", user.id);
    if (projectId) bpQuery.eq("project_id", projectId);

    const planQuery = supabase.from("business_plan").select("plan_json").eq("user_id", user.id);
    if (projectId) planQuery.eq("project_id", projectId);

    const tasksQuery = supabase
      .from("project_tasks")
      .select("id, title, status, due_date, timeframe, updated_at")
      .eq("user_id", user.id);
    if (projectId) tasksQuery.eq("project_id", projectId);

    const contentsQuery = supabase
      .from("content_item")
      .select("id, type, title, status, scheduled_date, created_at")
      .eq("user_id", user.id);
    if (projectId) contentsQuery.eq("project_id", projectId);

    const competitorQuery = supabase
      .from("competitor_analyses")
      .select("summary, strengths, weaknesses, opportunities")
      .eq("user_id", user.id);
    if (projectId) competitorQuery.eq("project_id", projectId);

    const [businessProfileRes, businessPlanRes, tasksRes, contentsRes, competitorRes] = await Promise.all([
      bpQuery.maybeSingle(),
      planQuery.maybeSingle(),
      tasksQuery.order("updated_at", { ascending: false }).limit(30),
      contentsQuery.order("created_at", { ascending: false }).limit(30),
      competitorQuery.maybeSingle(),
    ]);

    const living = summarizeLivingContext({
      businessProfile: businessProfileRes.data ?? null,
      planJson: (businessPlanRes.data as any)?.plan_json ?? null,
      tasks: tasksRes.data ?? [],
      contents: contentsRes.data ?? [],
    });

    const changedBlock = diffSnapshots(lastSnapshot, living.snapshot);
    const topicHints = detectTopicHints(userMessage);

    const knowledgeChunks = await safeSearchTipoteKnowledge(userMessage);
    const knowledgeBlock = formatKnowledgeBlock(knowledgeChunks);

    const activeExperiment = pickActiveExperiment(memoryRows);
    const checkInBlock =
      !isTeaser && activeExperiment && activeExperiment.status === "active" && isExperimentDue(activeExperiment)
        ? [
            "CHECK-IN REQUIRED:",
            `La dernière fois, on avait décidé de tester: "${activeExperiment.title}" pendant ${activeExperiment.duration_days} jours.`,
            "Tu DOIS commencer par demander le verdict (1 question courte), puis proposer 1 next step.",
          ].join("\n")
        : "";

    const systemBase = buildCoachSystemPrompt({ locale });
    const knowledgeRules = `
TIPOTE-KNOWLEDGE RULES:
- If internal knowledge is provided, prioritize it over generic advice.
- Do NOT mention "RAG" or technicalities.
- Use it to make the answer sharper (1 insight + 1 next step).
- Never paste large excerpts; synthesize.`;

    const system = isTeaser
      ? `${systemBase}${knowledgeRules}

MODE: TEASER (Free/Basic).
Rules:
- 3–6 lines max.
- 1 idea, 1 next step.
- Be warm, sharp, human.
- End with ONE short CTA to upgrade (Pro/Elite) to unlock full coach + actions.
- Do NOT output actionable DB suggestions (suggestions[] must be empty).`
      : goDeeper
        ? `${systemBase}${knowledgeRules}\n\nMODE: GO DEEPER. You can go deeper, but stay structured and avoid fluff.`
        : `${systemBase}${knowledgeRules}\n\nHARD RULE: Keep replies short (3–10 lines). One idea at a time.`;

    const userPrompt = [
      "LONG-TERM MEMORY (facts/tags + last session):",
      memoryBlock || "(none yet)",
      "",
      "LIVING CONTEXT (short, premium):",
      living.text,
      "",
      changedBlock ? changedBlock : "What changed since last time: (unknown / first session)",
      "",
      topicHints.length ? `Topic hints:\n- ${topicHints.join("\n- ")}` : "Topic hints: (none)",
      "",
      knowledgeBlock ? knowledgeBlock : "TIPOTE-KNOWLEDGE: (none)",
      "",
      competitorRes.data?.summary
        ? `COMPETITOR ANALYSIS:\n${competitorRes.data.summary}\n${
            competitorRes.data.strengths?.length
              ? `Strengths: ${JSON.stringify(competitorRes.data.strengths)}`
              : ""
          }\n${
            competitorRes.data.weaknesses?.length
              ? `Weaknesses: ${JSON.stringify(competitorRes.data.weaknesses)}`
              : ""
          }\n${
            competitorRes.data.opportunities?.length
              ? `Opportunities: ${JSON.stringify(competitorRes.data.opportunities)}`
              : ""
          }`
        : "COMPETITOR ANALYSIS: (none)",
      "",
      checkInBlock ? checkInBlock : "CHECK-IN: (none)",
      "",
      "CONVERSATION (recent):",
      JSON.stringify(history, null, 2),
      "",
      "USER MESSAGE:",
      userMessage,
    ].join("\n");

    let raw = "";

    if (openai) {
      const model = process.env.TIPOTE_COACH_MODEL?.trim() || "gpt-5.1";
      const ai = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 1200,
      });
      raw = ai.choices?.[0]?.message?.content ?? "";
    } else {
      const claudeKey =
        process.env.CLAUDE_API_KEY_OWNER?.trim() ||
        process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
        process.env.ANTHROPIC_API_KEY?.trim() ||
        "";

      if (!claudeKey) {
        return NextResponse.json({ ok: false, error: "Missing AI configuration (owner keys)." }, { status: 500 });
      }

      raw = await callClaude({
        apiKey: claudeKey,
        system,
        user: userPrompt,
        maxTokens: 1200,
        temperature: 0.6,
      });
    }

    let out: any = null;
    try {
      out = JSON.parse(raw || "{}");
    } catch {
      out = { message: String(raw || "").trim() };
    }

    const rawMessage = String(out?.message ?? "").trim() || "Ok. Donne-moi 1 précision et on avance.";
    const suggestions = sanitizeSuggestions(out?.suggestions, { isTeaser });

    const maxLines = isTeaser ? 6 : goDeeper ? 18 : 10;
    const message = enforceLineLimit(rawMessage, maxLines) || rawMessage;

    const memory = deriveMemory({
      userMessage,
      assistantMessage: message,
      history,
      contextSnapshot: living.snapshot,
    });

    if (isTeaser) {
      memory.facts = {
        ...(isRecord(memory.facts) ? (memory.facts as Record<string, unknown>) : {}),
        teaser_used: true,
        teaser_month: monthKey,
        teaser_plan: plan,
      } as any;
      memory.summary_tags = Array.from(new Set([...(memory.summary_tags || []), "teaser"]));
    }

    return NextResponse.json({ ok: true, message, suggestions, memory }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
