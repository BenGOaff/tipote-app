// lib/insights/global.ts (Tipote)
//
// Analyse IA STRATÉGIQUE GLOBALE : agrege les stats de TOUS les quiz et
// sondages d'un user pour un compte-rendu de pilotage. Porte de Tiquiz,
// adapte au modele Tipote (leads dans la table `leads`). Stockee dans
// user_insight_reports. Gate par credit a la 1ere generation.

import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { buildClaudeMessageBody } from "@/lib/claudeRequest";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

export const GLOBAL_MIN_LEADS = 5;
const MAX_PROJECTS = 60;

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    ""
  );
}
function getAnalysisModel(): string {
  return resolveAnthropicModel(process.env.TIPOTE_SURVEY_AI_MODEL || process.env.ANTHROPIC_MODEL, "opus");
}

export interface GlobalProjectStat {
  title: string;
  mode: "quiz" | "survey";
  status: string;
  views: number;
  completions: number;
  leads: number;
  captureRate: number | null;
}

export interface GlobalAggregate {
  projects: GlobalProjectStat[];
  droppedProjects: number;
  totals: { quizzes: number; surveys: number; views: number; completions: number; leads: number; captureRate: number | null };
}

export interface GlobalReport {
  summary: string;
  whatWorks: string[];
  toFix: string[];
  nextMoves: string[];
  stats_at_generation: { projects: number; leads: number };
  model: string;
  generated_at: string;
}

export async function aggregateGlobalInsights(userId: string): Promise<GlobalAggregate | null> {
  const { data: quizzesRaw } = await supabaseAdmin
    .from("quizzes")
    .select("id, title, mode, status, views_count, completions_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_PROJECTS + 1);
  const rows = (quizzesRaw ?? []) as Array<{
    id: string;
    title: string | null;
    mode: string | null;
    status: string | null;
    views_count: number | null;
    completions_count: number | null;
  }>;
  if (rows.length === 0) return null;

  const droppedProjects = Math.max(0, rows.length - MAX_PROJECTS);
  const kept = rows.slice(0, MAX_PROJECTS);

  // Leads par quiz : table `leads` (source='quiz', source_id), head-count
  // concurrent (borne a MAX_PROJECTS).
  const leadCounts = await Promise.all(
    kept.map((q) =>
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source", "quiz")
        .eq("source_id", q.id)
        .then((r) => r.count ?? 0),
    ),
  );

  const projects: GlobalProjectStat[] = kept.map((q, i) => {
    const leads = leadCounts[i] ?? 0;
    const views = Math.max(q.views_count ?? 0, leads);
    const viewsReliable = (q.views_count ?? 0) >= leads;
    const completions = q.completions_count ?? 0;
    return {
      title: stripHtml(String(q.title ?? "")).trim() || "Sans titre",
      mode: (String(q.mode ?? "quiz") === "survey" ? "survey" : "quiz") as "quiz" | "survey",
      status: String(q.status ?? "draft"),
      views,
      completions,
      leads,
      captureRate: viewsReliable && views > 0 ? Math.round((leads / views) * 1000) / 10 : null,
    };
  });

  const totals = projects.reduce(
    (acc, p) => {
      acc.views += p.views;
      acc.completions += p.completions;
      acc.leads += p.leads;
      if (p.mode === "survey") acc.surveys += 1;
      else acc.quizzes += 1;
      return acc;
    },
    { quizzes: 0, surveys: 0, views: 0, completions: 0, leads: 0, captureRate: null as number | null },
  );
  totals.captureRate = totals.views > 0 ? Math.round((totals.leads / totals.views) * 1000) / 10 : null;

  return { projects, droppedProjects, totals };
}

function renderForPrompt(a: GlobalAggregate): string {
  const t = a.totals;
  const lines: string[] = [
    `Portefeuille : ${t.quizzes} quiz, ${t.surveys} sondages.`,
    `Totaux : ${t.views} vues, ${t.completions} completions, ${t.leads} leads${t.captureRate !== null ? `, taux de capture global ${t.captureRate}%` : ""}.`,
    a.droppedProjects > 0 ? `(${a.droppedProjects} projets plus anciens non inclus dans le detail.)` : "",
    "",
    "DETAIL PAR PROJET (trie du plus recent au plus ancien) :",
  ];
  for (const p of a.projects) {
    lines.push(
      `- [${p.mode === "survey" ? "sondage" : "quiz"}, ${p.status}] "${p.title}" : ${p.views} vues, ${p.completions} completions, ${p.leads} leads${p.captureRate !== null ? `, capture ${p.captureRate}%` : ", capture non fiable (vues incompletes)"}`,
    );
  }
  return lines.filter(Boolean).join("\n");
}

export async function generateGlobalInsights(a: GlobalAggregate): Promise<GlobalReport> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new Error("Claude API key missing");
  const model = getAnalysisModel();

  const system = [
    "Tu es le stratege d'acquisition d'un createur qui utilise des quiz et sondages pour capter des leads et vendre.",
    "On te donne les stats agregees de TOUS ses projets. Tu produis un compte-rendu de pilotage : quoi garder, quoi corriger, quoi lancer ensuite.",
    "Principes a mobiliser : un quiz vise 20 a 50% de capture, chaque profil de resultat est un segment adressable avec une offre dediee, on concentre l'effort sur le projet a plus fort potentiel plutot que de s'eparpiller, on corrige le point de fuite unique avant d'ajouter du trafic, et on transforme un quiz qui marche en systeme (relance, sequence email, puis pub une fois la preuve faite).",
    "Tu reponds en francais, ton direct, tutoiement, zero remplissage. Tu te bases UNIQUEMENT sur les chiffres fournis.",
    "Reperes : capture <10% = a corriger, 20%+ = bon, 40%+ = excellent. Fort volume mais faible capture = priorite d'optimisation. Forte capture mais faible volume = priorite de trafic.",
    "Tu reponds STRICTEMENT en JSON valide, sans texte autour :",
    '{ "summary": string, "whatWorks": string[], "toFix": string[], "nextMoves": string[] }',
    "- summary : 2 a 4 phrases, l'etat des lieux honnete du portefeuille.",
    "- whatWorks : 2 a 4 points sur ce qui marche et qu'il faut amplifier (cite les projets par leur nom).",
    "- toFix : 2 a 5 problemes concrets a corriger, priorises (cite les projets).",
    "- nextMoves : 2 a 5 prochains mouvements strategiques a l'imperatif.",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: controller.signal,
      body: JSON.stringify(
        buildClaudeMessageBody({
          model,
          max_tokens: 2000,
          temperature: 0.4,
          system,
          messages: [{ role: "user", content: renderForPrompt(a) }],
        }),
      ),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = (json.content ?? []).map((c) => c.text ?? "").join("").trim();
  const parsed = parseReportJson(raw);

  return {
    ...parsed,
    stats_at_generation: { projects: a.projects.length, leads: a.totals.leads },
    model,
    generated_at: new Date().toISOString(),
  };
}

function parseReportJson(raw: string): {
  summary: string;
  whatWorks: string[];
  toFix: string[];
  nextMoves: string[];
} {
  let jsonStr = raw.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  if (!jsonStr.startsWith("{")) {
    const s = jsonStr.indexOf("{");
    const e = jsonStr.lastIndexOf("}");
    if (s >= 0 && e > s) jsonStr = jsonStr.slice(s, e + 1);
  }
  const toArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => sanitizeAiText(String(x).trim())).filter(Boolean) : [];
  const toStr = (v: unknown): string => (typeof v === "string" ? sanitizeAiText(v.trim()) : "");
  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      summary: toStr(obj.summary),
      whatWorks: toArr(obj.whatWorks),
      toFix: toArr(obj.toFix),
      nextMoves: toArr(obj.nextMoves),
    };
  } catch {
    return { summary: sanitizeAiText(raw.slice(0, 800)), whatWorks: [], toFix: [], nextMoves: [] };
  }
}
