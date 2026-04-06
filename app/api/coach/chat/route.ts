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
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { buildCoachSystemPrompt } from "@/lib/prompts/coach/system";
import { searchResourceChunks, type ResourceChunkMatch } from "@/lib/resources";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const ThreadSchema = z.enum(["general", "strategy", "sales", "content", "mindset"]).optional();

const BodySchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    thread: ThreadSchema,
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

function sanitizeSuggestions(
  raw: unknown,
  opts: { isTeaser: boolean; appliedTitles?: Set<string>; rejectedTitles?: Set<string> },
): CoachSuggestion[] {
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

    // Server-side dedup: skip suggestions that match already applied or rejected ones
    const titleLow = s.title.toLowerCase().trim();
    if (opts.appliedTitles?.has(titleLow) || opts.rejectedTitles?.has(titleLow)) continue;

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

function safeLocale(v: unknown): "fr" | "en" | "es" | "ar" | "it" {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("es")) return "es";
  if (s.startsWith("ar")) return "ar";
  if (s.startsWith("it")) return "it";
  return "fr";
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

// ────────── NEW: Persona context block ──────────
function formatPersonaBlock(persona: any | null): string {
  if (!persona) return "";
  const lines: string[] = ["PERSONA (client idéal):"];

  const name = typeof persona.name === "string" ? persona.name.trim() : "";
  if (name) lines.push(`- Nom: ${name.slice(0, 120)}`);

  // Parse pains/desires (can be string or array)
  const parseSafe = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x: any) => String(x ?? "").trim()).filter(Boolean);
    if (typeof v === "string") {
      try { const arr = JSON.parse(v); if (Array.isArray(arr)) return arr.map(String).filter(Boolean); } catch { /* ignore */ }
      return v.trim() ? [v.trim()] : [];
    }
    return [];
  };

  const pains = parseSafe(persona.pains);
  const desires = parseSafe(persona.desires);

  if (pains.length) lines.push(`- Douleurs: ${pains.slice(0, 6).join(" | ").slice(0, 400)}`);
  if (desires.length) lines.push(`- Désirs: ${desires.slice(0, 6).join(" | ").slice(0, 400)}`);

  // Channels from persona_json
  const pj = isRecord(persona.persona_json) ? (persona.persona_json as any) : {};
  const channels = parseSafe(pj.channels ?? pj.preferred_channels);
  if (channels.length) lines.push(`- Canaux préférés: ${channels.slice(0, 5).join(", ")}`);

  // Enriched markdown insights (condensed)
  const detailed = typeof pj.persona_detailed_markdown === "string" ? pj.persona_detailed_markdown.trim() : "";
  if (detailed) lines.push(`- Profil enrichi (résumé): ${detailed.slice(0, 600)}`);

  const narrative = typeof pj.narrative_synthesis_markdown === "string" ? pj.narrative_synthesis_markdown.trim() : "";
  if (narrative && !detailed) lines.push(`- Synthèse narrative: ${narrative.slice(0, 400)}`);

  return lines.length > 1 ? lines.join("\n") : "";
}

// ────────── NEW: Detailed offers block ──────────
function formatOffersBlock(offerPyramids: any[], userOffers: any[]): string {
  const lines: string[] = ["OFFRES DÉTAILLÉES:"];
  let hasContent = false;

  const formatOffer = (o: any, source: string) => {
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) return;
    hasContent = true;

    const level = typeof o.level === "string" ? o.level.trim() : "";
    const promise = typeof o.promise === "string" ? o.promise.trim() : "";
    const format = typeof o.format === "string" ? o.format.trim() : "";
    const desc = typeof o.description === "string" ? o.description.trim() : "";
    const delivery = typeof o.delivery === "string" ? o.delivery.trim() : "";
    const outcome = typeof o.main_outcome === "string" ? o.main_outcome.trim() : "";
    const priceMin = typeof o.price_min === "number" ? o.price_min : null;
    const priceMax = typeof o.price_max === "number" ? o.price_max : null;

    const pricePart = priceMin != null && priceMax != null
      ? priceMin === priceMax ? `${priceMin}€` : `${priceMin}–${priceMax}€`
      : priceMin != null ? `à partir de ${priceMin}€`
      : priceMax != null ? `jusqu'à ${priceMax}€`
      : "";

    const parts = [
      `  • ${name}`,
      level ? `(${level})` : "",
      pricePart ? `— ${pricePart}` : "",
    ].filter(Boolean).join(" ");

    lines.push(parts);
    if (promise) lines.push(`    Promesse: ${promise.slice(0, 200)}`);
    if (format) lines.push(`    Format: ${format.slice(0, 120)}`);
    if (outcome) lines.push(`    Résultat clé: ${outcome.slice(0, 200)}`);
    if (delivery) lines.push(`    Livraison: ${delivery.slice(0, 120)}`);
    if (desc && !promise) lines.push(`    Description: ${desc.slice(0, 200)}`);
  };

  if (offerPyramids.length) {
    lines.push("  [Offres générées / pyramide]");
    for (const o of offerPyramids.slice(0, 6)) formatOffer(o, "generated");
  }

  if (userOffers.length) {
    lines.push("  [Offres personnelles]");
    for (const o of userOffers.slice(0, 4)) formatOffer(o, "user");
  }

  return hasContent ? lines.join("\n") : "";
}

// ────────── NEW: Niche & mission block ──────────
function formatNicheMissionBlock(bp: any | null): string {
  if (!bp) return "";
  const lines: string[] = [];

  const niche = typeof bp.niche === "string" ? bp.niche.trim() : "";
  const mission = typeof bp.mission === "string" ? bp.mission.trim() : "";
  const activity = typeof bp.activity === "string" ? bp.activity.trim() : "";
  const sector = typeof bp.sector === "string" ? bp.sector.trim() : "";

  if (niche) lines.push(`- Niche: ${niche.slice(0, 200)}`);
  if (sector && sector !== niche) lines.push(`- Secteur: ${sector.slice(0, 120)}`);
  if (activity) lines.push(`- Activité: ${activity.slice(0, 200)}`);
  if (mission) lines.push(`- Mission: ${mission.slice(0, 400)}`);

  return lines.length ? `NICHE & POSITIONNEMENT:\n${lines.join("\n")}` : "";
}

// ────────── NEW: Enriched competitor block ──────────
function formatCompetitorBlock(data: any | null): string {
  if (!data) return "";
  const lines: string[] = ["ANALYSE CONCURRENTIELLE:"];
  let hasContent = false;

  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  if (summary) { lines.push(`Résumé: ${summary.slice(0, 600)}`); hasContent = true; }

  const strengths = Array.isArray(data.strengths) ? data.strengths.filter((s: any) => typeof s === "string" && s.trim()) : [];
  if (strengths.length) { lines.push(`Forces: ${strengths.slice(0, 5).join(" | ").slice(0, 400)}`); hasContent = true; }

  const weaknesses = Array.isArray(data.weaknesses) ? data.weaknesses.filter((s: any) => typeof s === "string" && s.trim()) : [];
  if (weaknesses.length) { lines.push(`Faiblesses: ${weaknesses.slice(0, 5).join(" | ").slice(0, 400)}`); hasContent = true; }

  const opportunities = Array.isArray(data.opportunities) ? data.opportunities.filter((s: any) => typeof s === "string" && s.trim()) : [];
  if (opportunities.length) { lines.push(`Opportunités: ${opportunities.slice(0, 5).join(" | ").slice(0, 400)}`); hasContent = true; }

  // Détails par concurrent si dispo
  const details = isRecord(data.competitor_details) ? data.competitor_details : null;
  if (details) {
    const entries = Object.entries(details).slice(0, 5);
    for (const [name, info] of entries) {
      if (!isRecord(info)) continue;
      const i = info as any;
      const positioning = typeof i.positioning === "string" ? i.positioning.trim() : "";
      const pricing = typeof i.pricing === "string" ? i.pricing.trim() : "";
      const audience = typeof i.audience === "string" ? i.audience.trim() : "";
      if (positioning || pricing || audience) {
        hasContent = true;
        const parts = [positioning, pricing ? `Prix: ${pricing}` : "", audience ? `Cible: ${audience}` : ""].filter(Boolean);
        lines.push(`• ${name}: ${parts.join(" — ").slice(0, 300)}`);
      }
    }
  }

  const matrix = typeof data.positioning_matrix === "string" ? data.positioning_matrix.trim() : "";
  if (matrix) { lines.push(`Matrice de positionnement: ${matrix.slice(0, 400)}`); hasContent = true; }

  return hasContent ? lines.join("\n") : "";
}

// ────────── NEW: Smart teaser observations for Free/Basic ──────────
function buildTeaserObservations(args: {
  persona: any | null;
  offerPyramids: any[];
  bp: any | null;
  planJson: any | null;
  tasks: any[];
  contents: any[];
  competitor: any | null;
}): string {
  const observations: string[] = [];

  // Check persona completeness
  const pj = isRecord(args.persona?.persona_json) ? (args.persona.persona_json as any) : null;
  const hasPains = (() => {
    const p = args.persona?.pains;
    if (Array.isArray(p)) return p.length > 0;
    if (typeof p === "string") { try { const a = JSON.parse(p); return Array.isArray(a) && a.length > 0; } catch { return !!p.trim(); } }
    return false;
  })();
  if (!hasPains) observations.push("Ton persona client n'a pas de douleurs définies — ça veut dire que toute ta communication risque de tomber à plat.");
  if (!pj?.persona_detailed_markdown) observations.push("Ton persona n'a pas été enrichi — tu passes à côté d'insights clés sur ton client idéal.");

  // Check offers
  if (args.offerPyramids.length === 0) {
    observations.push("Tu n'as pas encore d'offres structurées — sans pyramide de prix claire, tu laisses de l'argent sur la table.");
  } else {
    const noPrice = args.offerPyramids.filter((o: any) => o.price_min == null && o.price_max == null);
    if (noPrice.length > 0) observations.push(`${noPrice.length} de tes offres n'ont pas de prix défini — tes prospects ne peuvent pas se projeter.`);
    const noPromise = args.offerPyramids.filter((o: any) => !o.promise && !o.main_outcome);
    if (noPromise.length > 0) observations.push("Certaines offres n'ont pas de promesse claire — c'est pourtant le premier truc que tes prospects lisent.");
  }

  // Check tasks
  const openTasks = (args.tasks ?? []).filter((t: any) => String(t?.status ?? "").toLowerCase() !== "done");
  const overdue = openTasks.filter((t: any) => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < new Date();
  });
  if (overdue.length >= 3) observations.push(`Tu as ${overdue.length} tâches en retard — ça sent le planning qui dérape.`);

  // Check content
  const publishedCount = (args.contents ?? []).filter((c: any) => String(c?.status ?? "").toLowerCase() === "published").length;
  if (publishedCount === 0 && args.contents.length > 0) observations.push("Tu as des contenus créés mais aucun publié — ton audience ne voit rien de tout ça.");

  // Check competitor analysis
  if (!args.competitor?.summary) observations.push("Tu n'as pas analysé tes concurrents — dur de se différencier quand on ne sait pas contre qui on joue.");

  // Check niche
  if (!args.bp?.niche && !args.bp?.activity) observations.push("Ta niche n'est pas définie — sans positionnement clair, tu es invisible.");

  return observations.slice(0, 3).join("\n");
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

  return lines.slice(0, maxLines).join("\n").trim();
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

    // ✅ Gating + teaser (Free/Basic : 3 messages gratuits par mois)
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    let isTeaser = false;

    const TEASER_LIMIT = 3;

    if (plan !== "pro" && plan !== "elite" && plan !== "beta") {
      let usedQuery = supabase
        .from("coach_messages")
        .select("id")
        .eq("user_id", user.id);
      if (projectId) usedQuery = usedQuery.eq("project_id", projectId);
      const usedRes = await usedQuery
        .contains("facts", { teaser_month: monthKey })
        .limit(TEASER_LIMIT + 1);

      const usedCount = Array.isArray(usedRes.data) ? usedRes.data.length : 0;

      if (usedCount >= TEASER_LIMIT) {
        return NextResponse.json(
          {
            ok: false,
            code: "COACH_LOCKED",
            error:
              `Le coach premium est dispo sur les plans Pro et Elite. (Tu as utilisé tes ${TEASER_LIMIT} conseils gratuits ce mois — upgrade pour un accès illimité.)`,
          },
          { status: 403 },
        );
      }

      isTeaser = true;
    }

    const history = parsed.data.history ?? [];
    const userMessage = parsed.data.message;
    const thread = parsed.data.thread ?? "general";
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

    // Include rows with matching project_id OR null project_id (pre-project data)
    const pf = (q: any) =>
      projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q;

    const bpQuery = pf(supabase.from("business_profiles").select("*").eq("user_id", user.id));

    const planQuery = pf(supabase.from("business_plan").select("plan_json, updated_at").eq("user_id", user.id));

    const tasksQuery = pf(
      supabase
        .from("project_tasks")
        .select("id, title, status, due_date, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null),
    );

    const contentsQuery = pf(
      supabase
        .from("content_item")
        .select("id, type, title:titre, status:statut, scheduled_date:date_planifiee, created_at")
        .eq("user_id", user.id),
    );

    const competitorQuery = pf(
      supabase
        .from("competitor_analyses")
        .select("summary, strengths, weaknesses, opportunities, competitor_details, positioning_matrix, competitors")
        .eq("user_id", user.id),
    );

    // ✅ NEW: Persona enrichi
    const personaQuery = supabaseAdmin
      .from("personas")
      .select("name, pains, desires, persona_json, updated_at")
      .eq("user_id", user.id)
      .eq("role", "client_ideal")
      .order("updated_at", { ascending: false })
      .limit(1);

    // ✅ NEW: Offres détaillées (offer_pyramids)
    const offerPyramidsQuery = pf(
      supabase
        .from("offer_pyramids")
        .select("name, level, description, promise, format, delivery, price_min, price_max, main_outcome, is_flagship")
        .eq("user_id", user.id),
    );

    // Revenue metrics (current month)
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    const revenueQuery = pf(
      supabase
        .from("offer_metrics")
        .select("offer_name, revenue, sales_count, visitors, signups, month")
        .eq("user_id", user.id)
        .gte("month", currentMonth),
    );

    // Recent SIO sales for richer AI context (last 50 sales)
    const sioSalesQuery = pf(
      supabase
        .from("sio_sales")
        .select("offer_name, amount, currency, customer_first_name, status, created_at")
        .eq("user_id", user.id)
        .eq("status", "completed"),
    );

    const [businessProfileRes, businessPlanRes, tasksRes, contentsRes, competitorRes, personaRes, offerPyramidsRes, revenueRes, sioSalesRes] = await Promise.all([
      bpQuery.maybeSingle(),
      planQuery.maybeSingle(),
      tasksQuery.order("updated_at", { ascending: false }).limit(30),
      contentsQuery.order("created_at", { ascending: false }).limit(30),
      competitorQuery.maybeSingle(),
      personaQuery,
      offerPyramidsQuery.order("level", { ascending: true }).limit(10),
      revenueQuery.order("month", { ascending: false }).limit(20),
      sioSalesQuery.order("created_at", { ascending: false }).limit(50),
    ]);

    const personaData = (personaRes.data as any)?.[0] ?? null;
    let offerPyramidsData = (offerPyramidsRes.data ?? []) as any[];

    // Fallback: extract offers from business_plan.plan_json if offer_pyramids is empty
    if (offerPyramidsData.length === 0) {
      const planJson = (businessPlanRes.data as any)?.plan_json;
      if (planJson) {
        const selected =
          planJson?.selected_pyramid ??
          planJson?.pyramid?.selected_pyramid ??
          planJson?.pyramid ??
          planJson?.offer_pyramid ??
          null;
        if (selected && typeof selected === "object") {
          const levels: Array<[string, string]> = [
            ["lead_magnet", "lead_magnet"], ["free", "lead_magnet"], ["gratuit", "lead_magnet"],
            ["low_ticket", "low_ticket"],
            ["middle_ticket", "middle_ticket"], ["mid_ticket", "middle_ticket"],
            ["high_ticket", "high_ticket"], ["premium", "high_ticket"],
          ];
          for (const [key, level] of levels) {
            const o = (selected as any)[key];
            if (o && typeof o === "object") {
              offerPyramidsData.push({
                name: o.name ?? o.title ?? o.offer_name ?? key,
                level,
                description: o.description ?? null,
                promise: o.promise ?? o.promesse ?? null,
                format: o.format ?? null,
                delivery: o.delivery ?? null,
                price_min: typeof o.price === "number" ? o.price : (typeof o.price_min === "number" ? o.price_min : null),
                price_max: typeof o.price_max === "number" ? o.price_max : null,
                main_outcome: o.main_outcome ?? o.outcome ?? null,
                is_flagship: o.is_flagship ?? null,
              });
            }
          }
          // Also check for offers array shape
          const offersArr = (selected as any).offers ?? (selected as any).pyramid;
          if (Array.isArray(offersArr) && offerPyramidsData.length === 0) {
            for (const o of offersArr.slice(0, 6)) {
              if (!o || typeof o !== "object") continue;
              offerPyramidsData.push({
                name: o.name ?? o.title ?? o.offer_name ?? "Offre",
                level: o.level ?? o.offer_level ?? "",
                description: o.description ?? null,
                promise: o.promise ?? null,
                format: o.format ?? null,
                price_min: typeof o.price === "number" ? o.price : (typeof o.price_min === "number" ? o.price_min : null),
                price_max: typeof o.price_max === "number" ? o.price_max : null,
                main_outcome: o.main_outcome ?? null,
              });
            }
          }
        }
      }
    }

    // User-defined offers from business_profiles
    const bpOffers = Array.isArray((businessProfileRes.data as any)?.offers)
      ? ((businessProfileRes.data as any).offers as any[])
      : [];

    // Revenue data
    const revenueData = (revenueRes.data ?? []) as any[];

    // Recent SIO sales (real transactions from Systeme.io)
    const sioSales = (sioSalesRes.data ?? []) as any[];
    // Inject SIO sales summary into revenue context for the AI
    if (sioSales.length > 0) {
      const totalSioRevenue = sioSales.reduce((sum: number, s: any) => sum + (parseFloat(s.amount) || 0), 0);
      const offerBreakdown: Record<string, { count: number; total: number }> = {};
      for (const s of sioSales) {
        const name = s.offer_name || "Offre";
        if (!offerBreakdown[name]) offerBreakdown[name] = { count: 0, total: 0 };
        offerBreakdown[name].count++;
        offerBreakdown[name].total += parseFloat(s.amount) || 0;
      }
      // Add to revenueData so the AI sees it naturally
      revenueData.push({
        _sio_sales_summary: true,
        total_sio_revenue: totalSioRevenue,
        total_sio_sales: sioSales.length,
        sio_offer_breakdown: offerBreakdown,
        recent_sales: sioSales.slice(0, 10).map((s: any) => ({
          offer: s.offer_name,
          amount: s.amount,
          currency: s.currency,
          date: s.created_at,
        })),
      });
    }

    const revenueGoalMonthly =
      (businessProfileRes.data as any)?.revenue_goal_monthly ??
      (businessProfileRes.data as any)?.revenueGoalMonthly ??
      (businessProfileRes.data as any)?.target_monthly_revenue ??
      (businessProfileRes.data as any)?.revenue_goal ??
      null;

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
      activeExperiment && activeExperiment.status === "active" && isExperimentDue(activeExperiment)
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

MODE: TEASER (Free/Basic — accès limité, ${TEASER_LIMIT} messages/mois).
TONE & STYLE:
- Tu es un coach qui "ne peut pas s'en empêcher" : tu vois un truc important dans les données de l'user, et tu DOIS le dire.
- Commence par : "Normalement tu n'as pas accès au coaching complet avec ton abonnement…" ou variante naturelle.
- Puis enchaîne avec "mais j'ai remarqué que [observation ultra-spécifique basée sur les OBSERVATIONS PROACTIVES fournies]"
- Termine avec 1 conseil actionnable, concret, personnalisé.
- Dernier mot : une phrase courte donnant envie d'upgrader (Pro/Elite) pour "débloquer la suite".
- 4–8 lines max.
- Sois sharp, direct, humain. Jamais corporate.
- UTILISE les observations proactives fournies dans le contexte — ne les ignore PAS.
- Si aucune observation n'est disponible, fais un conseil général basé sur le living context.
- Do NOT output actionable DB suggestions (suggestions[] must be empty).`
      : goDeeper
        ? `${systemBase}${knowledgeRules}\n\nMODE: GO DEEPER. You can go deeper, but stay structured and avoid fluff.`
        : `${systemBase}${knowledgeRules}\n\nHARD RULE: Keep replies short (3–10 lines). One idea at a time.`;

    // ✅ NEW: Build enriched context blocks
    const personaBlock = formatPersonaBlock(personaData);
    const offersBlock = formatOffersBlock(offerPyramidsData, bpOffers);
    const nicheMissionBlock = formatNicheMissionBlock(businessProfileRes.data);
    const competitorBlock = formatCompetitorBlock(competitorRes.data);

    // For teaser mode, build smart observations
    const teaserObservations = isTeaser
      ? buildTeaserObservations({
          persona: personaData,
          offerPyramids: offerPyramidsData,
          bp: businessProfileRes.data,
          planJson: (businessPlanRes.data as any)?.plan_json ?? null,
          tasks: tasksRes.data ?? [],
          contents: contentsRes.data ?? [],
          competitor: competitorRes.data,
        })
      : "";

    const userPrompt = [
      "LONG-TERM MEMORY (facts/tags + last session):",
      memoryBlock || "(none yet)",
      "",
      nicheMissionBlock || "NICHE & POSITIONNEMENT: (non défini)",
      "",
      personaBlock || "PERSONA: (non défini — à clarifier avec l'user)",
      "",
      offersBlock || "OFFRES DÉTAILLÉES: (aucune offre structurée)",
      "",
      "LIVING CONTEXT (short, premium):",
      living.text,
      "",
      changedBlock ? changedBlock : "What changed since last time: (unknown / first session)",
      "",
      thread !== "general" ? `ACTIVE THREAD: ${thread.toUpperCase()} — Focus your response on this topic area.` : "",
      topicHints.length ? `Topic hints:\n- ${topicHints.join("\n- ")}` : "Topic hints: (none)",
      "",
      knowledgeBlock ? knowledgeBlock : "TIPOTE-KNOWLEDGE: (none)",
      "",
      competitorBlock || "ANALYSE CONCURRENTIELLE: (aucune)",
      "",
      // Revenue block
      (() => {
        const lines: string[] = ["REVENUS & OBJECTIF:"];
        const goalStr = typeof revenueGoalMonthly === "string" ? revenueGoalMonthly.trim() : typeof revenueGoalMonthly === "number" ? `${revenueGoalMonthly}€` : "";
        if (goalStr) lines.push(`- Objectif mensuel: ${goalStr}`);
        if (revenueData.length > 0) {
          const totalRevenue = revenueData.reduce((s: number, r: any) => s + (parseFloat(r.revenue) || 0), 0);
          const totalSales = revenueData.reduce((s: number, r: any) => s + (parseInt(r.sales_count) || 0), 0);
          const totalVisitors = revenueData.reduce((s: number, r: any) => s + (parseInt(r.visitors) || 0), 0);
          lines.push(`- CA ce mois: ${totalRevenue.toFixed(0)}€`);
          lines.push(`- Ventes ce mois: ${totalSales}`);
          if (totalVisitors > 0) lines.push(`- Visiteurs ce mois: ${totalVisitors}`);
          if (goalStr) {
            const goalNum = parseFloat(goalStr.replace(/[^0-9.,]/g, "").replace(",", "."));
            if (goalNum > 0) {
              const pct = Math.round((totalRevenue / goalNum) * 100);
              lines.push(`- Progression vers objectif: ${pct}%`);
            }
          }
        } else if (goalStr) {
          lines.push("- Pas encore de données de revenus ce mois.");
        }
        return lines.length > 1 ? lines.join("\n") : "REVENUS: (pas de données)";
      })(),
      "",
      checkInBlock ? checkInBlock : "CHECK-IN: (none)",
      "",
      ...(isTeaser && teaserObservations
        ? [
            "OBSERVATIONS PROACTIVES (pour teaser — utilise-les pour ton message):",
            teaserObservations,
            "",
          ]
        : []),
      "CONVERSATION (recent):",
      JSON.stringify(history, null, 2),
      "",
      "USER MESSAGE:",
      userMessage,
    ].join("\n");

    let raw = "";

    if (openai) {
      const model = process.env.TIPOTE_COACH_MODEL?.trim() || OPENAI_MODEL;
      const ai = await openai.chat.completions.create({
        ...cachingParams("coach"),
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 1200,
      } as any);
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

    // Extract applied/rejected suggestion titles from memory for server-side dedup
    const appliedTitles = new Set<string>();
    const rejectedTitles = new Set<string>();
    for (const r of memoryRows) {
      if (!isRecord(r.facts)) continue;
      const f = r.facts as any;
      if (isRecord(f.applied_suggestion) && typeof f.applied_suggestion.title === "string") {
        appliedTitles.add(f.applied_suggestion.title.toLowerCase().trim());
      }
      if (Array.isArray(f.rejected_suggestions)) {
        for (const rs of f.rejected_suggestions) {
          if (isRecord(rs) && typeof (rs as any).title === "string") {
            rejectedTitles.add((rs as any).title.toLowerCase().trim());
          }
        }
      }
    }

    const rawMessage = String(out?.message ?? "").trim() || "Ok. Donne-moi 1 précision et on avance.";
    const suggestions = sanitizeSuggestions(out?.suggestions, { isTeaser, appliedTitles, rejectedTitles });

    const maxLines = isTeaser ? 8 : goDeeper ? 18 : 10;
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
