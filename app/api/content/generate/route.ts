// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item (mode async via placeholder row)
// ✅ Credits: vérification avant appel IA, consommation après succès (RPC)
// ✅ Async: placeholder row => jobId = content_item.id, puis update quand c’est fini.
// ✅ Compat DB : tags peut être array OU texte CSV -> insert/update avec retry.
// ✅ Output : texte brut (pas de markdown) (articles: **gras** autorisé uniquement pour mots-clés)
// ✅ Knowledge : injecte tipote-knowledge via manifest (xlsx) + lecture des ressources
// ✅ Persona : lit public.personas (persona_json + colonnes lisibles) et injecte dans le prompt.
// ✅ Emails: support nouveau modèle via buildEmailPrompt.
// ✅ Articles: support 2 étapes via buildArticlePrompt.
// ✅ Vidéos: support prompt builder via buildVideoScriptPrompt.
// ✅ Offres: support lead magnet + offre payante via buildOfferPrompt (mode from_pyramid / from_scratch)
// ✅ Claude uniquement (owner key): jamais de clé user côté API.

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

import { buildPromptByType } from "@/lib/prompts/content";
import { buildSocialPostPrompt } from "@/lib/prompts/content/socialPost";
import { buildVideoScriptPrompt } from "@/lib/prompts/content/video";
import { buildEmailPrompt } from "@/lib/prompts/content/email";
import { buildArticlePrompt } from "@/lib/prompts/content/article";
import { buildOfferPrompt } from "@/lib/prompts/content/offer";
import type { OfferMode, OfferPyramidContext, OfferType } from "@/lib/prompts/content/offer";

import fs from "node:fs/promises";
import path from "node:path";

/** ---------------------------
 * Types
 * -------------------------- */

type Body = {
  type?: string;
  channel?: string;
  scheduledDate?: string | null;
  tags?: string[] | string;

  // commun
  prompt?: string;
  brief?: string;
  consigne?: string;
  angle?: string;
  text?: string;

  // post
  platform?: string;
  subject?: string;
  theme?: string;
  tone?: string;
  batchCount?: number;
  promoKind?: "paid" | "free";
  offerLink?: string;

  // video
  duration?: string; // "30s" | "60s" | "90s" | "120s" | "180s" | "300s" (selon lib)
  targetWordCount?: number;

  // offer
  offerMode?: "from_pyramid" | "from_scratch";
  offerType?: "lead_magnet" | "paid_training";
  leadMagnetFormat?: string;
  sourceOfferId?: string;
  target?: string;
  offerManual?: {
    name?: string;
    promise?: string;
    main_outcome?: string;
    description?: string;
    price?: string;
  };

  // email
  emailType?: "newsletter" | "sales" | "onboarding";
  salesMode?: "single" | "sequence_7";
  newsletterTheme?: string;
  newsletterCta?: string;
  salesCta?: string;
  leadMagnetLink?: string;
  onboardingCta?: string;
  formality?: "tu" | "vous";
  offer?: string; // nom libre si pas de pyramide
  offerId?: string; // pyramide (optionnel)

  // article (2 étapes)
  articleStep?: "plan" | "write";
  objective?: "traffic_seo" | "authority" | "emails" | "sales";
  seoKeyword?: string; // => primaryKeyword
  secondaryKeywords?: string;
  links?: string;
  ctaText?: string;
  ctaLink?: string;
  approvedPlan?: string;

  // compat legacy
  cta?: string;
};

type Provider = "claude";

/** ---------------------------
 * Utils
 * -------------------------- */

function safeString(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function isoDateOrNull(x: unknown): string | null {
  const s = safeString(x).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function joinTagsCsv(tags: string[]): string {
  return (tags ?? [])
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 50)
    .join(",");
}

function safeJsonParse<T>(v: unknown): T | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function arrayFromTextOrJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v !== "string") return [];
  const parsed = safeJsonParse<unknown>(v);
  if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  return v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    m.includes("schema cache") ||
    m.includes("pgrst") ||
    (m.includes("column") && (m.includes("exist") || m.includes("unknown")))
  );
}

function isTagsTypeMismatch(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("malformed array") ||
    m.includes("invalid input") ||
    m.includes("array") ||
    m.includes("json") ||
    m.includes("character varying") ||
    m.includes("text")
  );
}

function toPlainText(input: string): string {
  let s = (input ?? "").replace(/\r\n/g, "\n");
  s = s.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_m, code) => String(code ?? "").trim());
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, "");
  s = s.replace(/^\s{0,3}\d+\.\s+/gm, "");
  s = s.replace(/\*\*(.*?)\*\*/g, "$1");
  s = s.replace(/__(.*?)__/g, "$1");
  s = s.replace(/\*(.*?)\*/g, "$1");
  s = s.replace(/_(.*?)_/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^[•●▪︎■]\s+/gm, "- ");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

// Version "article": on garde **bold** (mots-clés), mais on nettoie le reste
function toPlainTextKeepBold(input: string): string {
  let s = (input ?? "").replace(/\r\n/g, "\n");
  s = s.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_m, code) => String(code ?? "").trim());
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, "");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^[•●▪︎■]\s+/gm, "- ");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function normalizeBatchCount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim() || "NaN");
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

function normalizePromoKind(raw: unknown): "paid" | "free" {
  const s = safeString(raw).trim().toLowerCase();
  return s === "free" ? "free" : "paid";
}

function normalizeFormality(raw: unknown): "tu" | "vous" {
  const s = safeString(raw).trim().toLowerCase();
  return s === "vous" ? "vous" : "tu";
}

function normalizeArticleStep(raw: unknown): "plan" | "write" {
  const s = safeString(raw).trim().toLowerCase();
  return s === "write" ? "write" : "plan";
}

function normalizeArticleObjective(raw: unknown): "traffic_seo" | "authority" | "emails" | "sales" | null {
  const s0 = safeString(raw).trim();
  if (!s0) return null;

  const s = s0
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[’']/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (s === "traffic_seo" || s === "trafic_seo" || s === "seo" || s === "trafic") return "traffic_seo";
  if (s === "authority" || s === "autorite") return "authority";
  if (s === "emails" || s === "email" || s === "newsletter") return "emails";
  if (s === "sales" || s === "vente" || s === "ventes" || s === "conversion") return "sales";
  return null;
}

function parseSecondaryKeywords(raw: string): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\n,]/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function parseLinks(raw: string): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/\n+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** ---------------------------
 * DB helpers (compat EN/FR)
 * -------------------------- */

async function insertContentEN(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  type: string;
  title: string | null;
  content: string;
  channel: string | null;
  scheduledDate: string | null;
  tags: string[];
  tagsCsv: string;
  status: string;
}) {
  const { supabase, ...row } = params;

  const first = await supabase
    .from("content_item")
    .insert({
      user_id: row.userId,
      content_type: row.type,
      title: row.title,
      content: row.content,
      status: row.status,
      channel: row.channel,
      scheduled_date: row.scheduledDate,
      tags: row.tags,
    } as any)
    .select("id, title")
    .single();

  if (first.error && isTagsTypeMismatch(first.error.message) && row.tagsCsv) {
    const retry = await supabase
      .from("content_item")
      .insert({
        user_id: row.userId,
        content_type: row.type,
        title: row.title,
        content: row.content,
        status: row.status,
        channel: row.channel,
        scheduled_date: row.scheduledDate,
        tags: row.tagsCsv,
      } as any)
      .select("id, title")
      .single();

    return { data: retry.data, error: retry.error };
  }

  return { data: first.data, error: first.error };
}

async function insertContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  type: string;
  title: string | null;
  content: string;
  channel: string | null;
  scheduledDate: string | null;
  tags: string[];
  tagsCsv: string;
  status: string;
}) {
  const { supabase, ...row } = params;

  const first = await supabase
    .from("content_item")
    .insert({
      user_id: row.userId,
      type: row.type,
      titre: row.title,
      contenu: row.content,
      statut: row.status,
      canal: row.channel,
      date_planifiee: row.scheduledDate,
      tags: row.tags,
    } as any)
    .select("id, titre")
    .single();

  if (first.error && isTagsTypeMismatch(first.error.message) && row.tagsCsv) {
    const retry = await supabase
      .from("content_item")
      .insert({
        user_id: row.userId,
        type: row.type,
        titre: row.title,
        contenu: row.content,
        statut: row.status,
        canal: row.channel,
        date_planifiee: row.scheduledDate,
        tags: row.tagsCsv,
      } as any)
      .select("id, titre")
      .single();

    return { data: retry.data, error: retry.error };
  }

  return { data: first.data, error: first.error };
}

async function updateContentEN(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  id: string;
  title: string | null;
  content: string;
  status: string;
  tags: string[];
  tagsCsv: string;
}) {
  const { supabase, ...row } = params;

  const first = await supabase
    .from("content_item")
    .update({
      title: row.title,
      content: row.content,
      status: row.status,
      tags: row.tags,
    } as any)
    .eq("id", row.id)
    .select("id, title")
    .single();

  if (first.error && isTagsTypeMismatch(first.error.message) && row.tagsCsv) {
    const retry = await supabase
      .from("content_item")
      .update({
        title: row.title,
        content: row.content,
        status: row.status,
        tags: row.tagsCsv,
      } as any)
      .eq("id", row.id)
      .select("id, title")
      .single();

    return { data: retry.data, error: retry.error };
  }

  return { data: first.data, error: first.error };
}

async function updateContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  id: string;
  title: string | null;
  content: string;
  status: string;
  tags: string[];
  tagsCsv: string;
}) {
  const { supabase, ...row } = params;

  const first = await supabase
    .from("content_item")
    .update({
      titre: row.title,
      contenu: row.content,
      statut: row.status,
      tags: row.tags,
    } as any)
    .eq("id", row.id)
    .select("id, titre")
    .single();

  if (first.error && isTagsTypeMismatch(first.error.message) && row.tagsCsv) {
    const retry = await supabase
      .from("content_item")
      .update({
        titre: row.title,
        contenu: row.content,
        statut: row.status,
        tags: row.tagsCsv,
      } as any)
      .eq("id", row.id)
      .select("id, titre")
      .single();

    return { data: retry.data, error: retry.error };
  }

  return { data: first.data, error: first.error };
}

/** ---------------------------
 * Tipote Knowledge (manifest + ressources) — fail-open
 * -------------------------- */

type KnowledgeEntry = {
  title: string;
  tags: string[];
  relPath: string;
  type?: string;
  priority?: number;
};

let knowledgeCache:
  | {
      manifestMtimeMs: number;
      entries: KnowledgeEntry[];
    }
  | undefined;

function tokenizeForMatch(input: string): string[] {
  const s = (input ?? "").toLowerCase();
  return s
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3)
    .slice(0, 80);
}

function normalizeTagsArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((x) => x.trim()).filter(Boolean);
  const s = String(raw);
  return s
    .split(/[,;|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function pickAnyField(obj: Record<string, any>, candidates: string[]): any {
  for (const c of candidates) {
    const hit = Object.keys(obj).find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return obj[hit];
  }
  for (const c of candidates) {
    const hit = Object.keys(obj).find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return obj[hit];
  }
  return undefined;
}

async function loadKnowledgeManifestEntries(): Promise<KnowledgeEntry[]> {
  const root = process.cwd();
  const manifestPath = path.join(root, "tipote-knowledge", "manifest", "resources_manifest.xlsx");

  let stat: { mtimeMs: number } | null = null;
  try {
    stat = await fs.stat(manifestPath);
  } catch {
    return [];
  }

  if (knowledgeCache && knowledgeCache.manifestMtimeMs === stat.mtimeMs) {
    return knowledgeCache.entries;
  }

  let XLSX: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    XLSX = require("xlsx");
  } catch {
    knowledgeCache = { manifestMtimeMs: stat.mtimeMs, entries: [] };
    return [];
  }

  let entries: KnowledgeEntry[] = [];
  try {
    const wb = XLSX.readFile(manifestPath, { cellDates: false });
    const firstSheetName = wb.SheetNames?.[0];
    if (!firstSheetName) {
      knowledgeCache = { manifestMtimeMs: stat.mtimeMs, entries: [] };
      return [];
    }

    const sheet = wb.Sheets[firstSheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    entries = rows
      .map((r) => {
        const titleRaw = pickAnyField(r, ["title", "titre", "name", "nom"]) ?? "";
        const pathRaw =
          pickAnyField(r, ["path", "filepath", "file_path", "relative_path", "rel_path", "source"]) ?? "";
        const tagsRaw = pickAnyField(r, ["tags", "tag", "keywords", "mots_cles"]) ?? "";
        const typeRaw = pickAnyField(r, ["type", "category", "categorie", "kind"]) ?? "";
        const prioRaw = pickAnyField(r, ["priority", "prio", "score", "weight"]) ?? "";

        const title = String(titleRaw || "").trim();
        const relPath = String(pathRaw || "").trim();
        const tags = normalizeTagsArray(tagsRaw);
        const type = String(typeRaw || "").trim() || undefined;

        let priority: number | undefined = undefined;
        const pr = Number(String(prioRaw || "").trim());
        if (!Number.isNaN(pr)) priority = pr;

        if (!title || !relPath) return null;
        return { title, relPath, tags, type, priority } as KnowledgeEntry;
      })
      .filter(Boolean) as KnowledgeEntry[];
  } catch {
    entries = [];
  }

  knowledgeCache = { manifestMtimeMs: stat.mtimeMs, entries };
  return entries;
}

async function readKnowledgeFileSnippet(relPath: string, maxChars: number): Promise<string | null> {
  const root = process.cwd();
  const cleanRel = relPath.replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const abs = path.join(root, cleanRel);

  let buf: string;
  try {
    buf = await fs.readFile(abs, "utf8");
  } catch {
    try {
      const alt = path.join(root, "tipote-knowledge", cleanRel);
      buf = await fs.readFile(alt, "utf8");
    } catch {
      return null;
    }
  }

  const s = buf
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!s) return null;
  return s.slice(0, maxChars);
}

function scoreEntry(entry: KnowledgeEntry, tokens: string[], tags: string[], type: string): number {
  let score = 0;

  const t = (entry.title ?? "").toLowerCase();
  const eTags = (entry.tags ?? []).map((x) => x.toLowerCase());
  const eType = (entry.type ?? "").toLowerCase();
  const reqType = (type ?? "").toLowerCase();

  if (eType && reqType && (eType.includes(reqType) || reqType.includes(eType))) score += 8;

  const tagsLower = (tags ?? []).map((x) => x.toLowerCase());
  for (const tg of tagsLower) {
    if (!tg) continue;
    if (eTags.some((x) => x.includes(tg) || tg.includes(x))) score += 6;
    if (t.includes(tg)) score += 3;
  }

  for (const tok of tokens) {
    if (!tok) continue;
    if (t.includes(tok)) score += 2;
    if (eTags.some((x) => x.includes(tok))) score += 3;
  }

  if (typeof entry.priority === "number") score += Math.max(0, Math.min(10, entry.priority));
  return score;
}

async function getKnowledgeSnippets(args: {
  type: string;
  prompt: string;
  tags: string[];
}): Promise<Array<{ title: string; snippet: string; source: string }>> {
  const entries = await loadKnowledgeManifestEntries();
  if (!entries.length) return [];

  const tokens = tokenizeForMatch(args.prompt);
  const scored = entries
    .map((e) => ({ e, s: scoreEntry(e, tokens, args.tags, args.type) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);

  const out: Array<{ title: string; snippet: string; source: string }> = [];
  for (const it of scored) {
    const snippet = await readKnowledgeFileSnippet(it.e.relPath, 1800);
    if (!snippet) continue;

    out.push({ title: it.e.title, snippet, source: it.e.relPath });
    if (out.length >= 4) break;
  }
  return out;
}

/** ---------------------------
 * Offer pyramids helpers (fail-open)
 * -------------------------- */

const OFFER_PYRAMID_SELECT =
  "id,name,level,description,promise,price_min,price_max,main_outcome,format,delivery,is_flagship,updated_at";

function normalizeOfferMode(raw: unknown): OfferMode {
  const s = safeString(raw).trim().toLowerCase();
  return s === "from_pyramid" ? "from_pyramid" : "from_scratch";
}

function normalizeOfferType(raw: unknown): OfferType | null {
  const s = safeString(raw).trim().toLowerCase();
  if (s === "paid_training") return "paid_training";
  if (s === "lead_magnet") return "lead_magnet";
  return null;
}

async function fetchOfferPyramidById(args: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  id: string;
}): Promise<OfferPyramidContext | null> {
  const { supabase, userId, id } = args;
  if (!id) return null;

  const q1 = await supabase
    .from("offer_pyramids")
    .select(OFFER_PYRAMID_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!q1.error) return (q1.data as any) ?? null;

  if (isMissingColumnError(q1.error.message)) {
    const q2 = await supabase.from("offer_pyramids").select(OFFER_PYRAMID_SELECT).eq("id", id).maybeSingle();
    if (!q2.error) return (q2.data as any) ?? null;
  }

  return null;
}

async function fetchUserLeadMagnet(args: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
}): Promise<OfferPyramidContext | null> {
  const { supabase, userId } = args;

  const probe = await supabase.from("offer_pyramids").select("id,user_id").limit(1).maybeSingle();
  if (probe.error && isMissingColumnError(probe.error.message)) {
    return null;
  }

  const q = await supabase
    .from("offer_pyramids")
    .select(OFFER_PYRAMID_SELECT)
    .eq("user_id", userId)
    .or("level.ilike.%lead%,level.ilike.%free%,level.ilike.%gratuit%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!q.error && q.data) return q.data as any;
  return null;
}

async function fetchUserPaidOffer(args: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
}): Promise<OfferPyramidContext | null> {
  const { supabase, userId } = args;

  const probe = await supabase.from("offer_pyramids").select("id,user_id").limit(1).maybeSingle();
  if (probe.error && isMissingColumnError(probe.error.message)) {
    return null;
  }

  const middle = await supabase
    .from("offer_pyramids")
    .select(OFFER_PYRAMID_SELECT)
    .eq("user_id", userId)
    .or("level.ilike.%middle%,level.ilike.%mid%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!middle.error && middle.data) return middle.data as any;

  const high = await supabase
    .from("offer_pyramids")
    .select(OFFER_PYRAMID_SELECT)
    .eq("user_id", userId)
    .or("level.ilike.%high%,level.ilike.%premium%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!high.error && high.data) return high.data as any;

  const anyPaid = await supabase
    .from("offer_pyramids")
    .select(OFFER_PYRAMID_SELECT)
    .eq("user_id", userId)
    .not("level", "ilike", "%free%")
    .not("level", "ilike", "%gratuit%")
    .not("level", "ilike", "%lead%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!anyPaid.error && anyPaid.data) return anyPaid.data as any;

  return null;
}

/** ---------------------------
 * Claude caller (owner key)
 * -------------------------- */

async function callClaude(args: { apiKey: string; system: string; user: string }): Promise<string> {
  const model = process.env.TIPOTE_CLAUDE_MODEL?.trim() || "claude-3-5-sonnet-20240620";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      temperature: 0.7,
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

/** ---------------------------
 * Main handler
 * -------------------------- */

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = (await req.json()) as Body;

    const type = safeString(body?.type).trim();
    const channel = safeString(body?.channel).trim() || null;
    const scheduledDate = isoDateOrNull(body?.scheduledDate ?? null);

    const tags =
      Array.isArray(body?.tags)
        ? body.tags.filter(Boolean).map(String)
        : arrayFromTextOrJson(body?.tags);

    const prompt =
      safeString(body?.prompt).trim() ||
      safeString(body?.brief).trim() ||
      safeString(body?.consigne).trim() ||
      safeString(body?.angle).trim() ||
      safeString(body?.text).trim();

    if (!type) return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });

    // ✅ Crédit IA requis (1 crédit = 1 génération)
    const balance = await ensureUserCredits(userId);
    if (balance.total_remaining <= 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "NO_CREDITS",
          error: "Crédits insuffisants. Recharge tes crédits ou upgrade ton abonnement pour continuer.",
          balance,
          upgrade_url: "/pricing",
        },
        { status: 402 },
      );
    }

    const apiKey =
      process.env.CLAUDE_API_KEY_OWNER?.trim() ||
      process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, code: "missing_owner_api_key", error: "Clé Claude owner manquante (env CLAUDE_API_KEY_OWNER)." },
        { status: 500 },
      );
    }

    const tagsCsv = joinTagsCsv(tags);

    // ✅ Contexte (optionnel) : business profile + plan
    const { data: profile } = await supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
    const { data: planRow } = await supabase.from("business_plan").select("plan_json").eq("user_id", userId).maybeSingle();
    const planJson = (planRow as any)?.plan_json ?? null;

    // ✅ Persona (optionnel)
    let personaContext: any = null;
    try {
      const { data: personaRow, error: personaErr } = await supabase
        .from("personas")
        .select("persona_json,name,role,description,pains,desires,objections,current_situation,desired_situation,awareness_level,budget_level,updated_at")
        .eq("user_id", userId)
        .eq("role", "client_ideal")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!personaErr && personaRow) {
        const pj = (typeof (personaRow as any).persona_json === "object" && (personaRow as any).persona_json) || null;
        personaContext =
          pj ?? {
            title: (personaRow as any).name ?? null,
            current_situation: (personaRow as any).current_situation ?? null,
            desired_situation: (personaRow as any).desired_situation ?? null,
            pains: arrayFromTextOrJson((personaRow as any).pains),
            desires: arrayFromTextOrJson((personaRow as any).desires),
            objections: arrayFromTextOrJson((personaRow as any).objections),
            awareness_level: (personaRow as any).awareness_level ?? null,
            budget_level: (personaRow as any).budget_level ?? null,
            description: (personaRow as any).description ?? null,
            updated_at: (personaRow as any).updated_at ?? null,
          };
      } else if (personaErr && !isMissingColumnError(personaErr.message)) {
        console.error("Error loading personas:", personaErr);
      }
    } catch (e) {
      console.error("Error loading personas (catch):", e);
    }

    // ✅ System prompt
    const systemPrompt =
      "Tu es un expert francophone en copywriting, marketing et stratégie de contenu. " +
      "Tu dois produire des contenus très actionnables, concrets, et de haute qualité. " +
      "Retourne uniquement le contenu final, sans explication, sans markdown.";

    const batchCount = normalizeBatchCount(body.batchCount);
    const promoKind = normalizePromoKind(body.promoKind);

    /** ---------------------------
     * Offre (pyramide) — pour offer generator + emails sales
     * -------------------------- */

    const offerMode = normalizeOfferMode(body.offerMode);
    const offerTypeNorm = normalizeOfferType(body.offerType);
    const sourceOfferId = safeString(body.sourceOfferId).trim();
    const offerId = safeString(body.offerId).trim();
    const offerName = safeString(body.offer).trim();
    const offerManual = isRecord(body.offerManual) ? body.offerManual : null;

    let sourceOffer: OfferPyramidContext | null = null;

    if (type === "offer" && offerMode === "from_pyramid") {
      if (sourceOfferId) {
        sourceOffer = await fetchOfferPyramidById({ supabase, userId, id: sourceOfferId });
      } else if (offerTypeNorm === "lead_magnet") {
        sourceOffer = await fetchUserLeadMagnet({ supabase, userId });
      } else if (offerTypeNorm === "paid_training") {
        sourceOffer = await fetchUserPaidOffer({ supabase, userId });
      }

      if (!sourceOffer) {
        return NextResponse.json(
          {
            ok: false,
            code: "missing_source_offer",
            error:
              "Impossible de retrouver automatiquement l'offre source de la pyramide. Réessaie ou choisis explicitement l'offre source.",
          },
          { status: 400 },
        );
      }
    }

    let offerContextForSalesEmail: OfferPyramidContext | null = null;
    if (type === "email" && offerId) {
      try {
        const { data: offerRow, error: offerErr } = await supabase
          .from("offer_pyramids")
          .select(OFFER_PYRAMID_SELECT)
          .eq("id", offerId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!offerErr && offerRow) offerContextForSalesEmail = offerRow as any;
      } catch {
        // fail-open
      }
    }

    // ✅ Validation emails sales : il faut une offre (pyramide ou nom) OU un manuel
    const emailTypeRaw = safeString(body.emailType).trim().toLowerCase();
    const salesModeRaw = safeString(body.salesMode).trim().toLowerCase();
    const computedEmailType =
      emailTypeRaw === "sales"
        ? (salesModeRaw === "sequence_7" ? ("sales_sequence_7" as const) : ("sales_single" as const))
        : emailTypeRaw === "onboarding"
          ? ("onboarding_klt_3" as const)
          : ("newsletter" as const);

    if (type === "email" && (computedEmailType === "sales_single" || computedEmailType === "sales_sequence_7")) {
      const hasManual =
        !!offerManual &&
        (safeString(offerManual?.name).trim() ||
          safeString(offerManual?.promise).trim() ||
          safeString(offerManual?.main_outcome).trim());

      if (!offerId && !offerName && !hasManual) {
        return NextResponse.json(
          {
            ok: false,
            error: "Choisis une offre (pyramide) ou renseigne les spécificités de l'offre pour générer l'email de vente.",
          },
          { status: 400 },
        );
      }
    }

    /** ---------------------------
     * Prompt builder
     * -------------------------- */

    const effectivePrompt = (() => {
      if (type === "post") {
        const platform = safeString(body.platform).trim() as any;
        const subject = safeString(body.subject).trim();
        const theme = safeString(body.theme).trim();
        const tone = safeString(body.tone).trim() as any;

        const offerLink = safeString(body.offerLink).trim() || undefined;

        return buildSocialPostPrompt({
          platform,
          subject: subject || theme || prompt || "Contenu",
          tone,
          batchCount,
          promoKind,
          offerLink,
        } as any);
      }

      if (type === "video") {
        const duration = (safeString(body.duration).trim() || "60s") as any;
        const theme = safeString(body.theme).trim();
        const subject = safeString(body.subject).trim();
        const tone = safeString(body.tone).trim();

        return buildVideoScriptPrompt({
          duration,
          theme: theme || subject || prompt || "Vidéo",
          tone: tone || undefined,
          targetWordCount: typeof body.targetWordCount === "number" ? body.targetWordCount : undefined,
          offerLink: safeString(body.offerLink).trim() || undefined,
        } as any);
      }

      if (type === "email") {
        const emailTypeRaw = safeString(body.emailType).trim().toLowerCase();
        const salesModeRaw = safeString(body.salesMode).trim().toLowerCase();
        const formality = normalizeFormality(body.formality);

        const newsletterTheme = safeString(body.newsletterTheme).trim();
        const newsletterCta = safeString(body.newsletterCta).trim();
        const salesCta = safeString(body.salesCta).trim();
        const leadMagnetLink = safeString(body.leadMagnetLink).trim();
        const onboardingCta = safeString(body.onboardingCta).trim();

        let emailType: any = "newsletter";
        if (emailTypeRaw === "sales") {
          emailType = salesModeRaw === "sequence_7" ? "sales_sequence_7" : "sales_single";
        } else if (emailTypeRaw === "onboarding") {
          emailType = "onboarding_klt_3";
        } else {
          emailType = "newsletter";
        }

        return buildEmailPrompt({
          type: emailType,
          theme:
            newsletterTheme ||
            safeString(body.subject).trim() ||
            safeString(body.theme).trim() ||
            prompt ||
            "Email",
          cta: (newsletterCta || salesCta || onboardingCta || undefined) as any,
          leadMagnetLink: leadMagnetLink || undefined,
          offer:
            emailType === "sales_single" || emailType === "sales_sequence_7"
              ? offerContextForSalesEmail
                ? {
                    id: (offerContextForSalesEmail as any)?.id ?? undefined,
                    name: (offerContextForSalesEmail as any)?.name ?? undefined,
                    level: (offerContextForSalesEmail as any)?.level ?? undefined,
                    promise: (offerContextForSalesEmail as any)?.promise ?? undefined,
                    description: (offerContextForSalesEmail as any)?.description ?? undefined,
                    price_min: (offerContextForSalesEmail as any)?.price_min ?? undefined,
                    price_max: (offerContextForSalesEmail as any)?.price_max ?? undefined,
                    main_outcome: (offerContextForSalesEmail as any)?.main_outcome ?? undefined,
                    format: (offerContextForSalesEmail as any)?.format ?? undefined,
                    delivery: (offerContextForSalesEmail as any)?.delivery ?? undefined,
                  }
                : offerName
                  ? { name: offerName }
                  : undefined
              : undefined,
          offerManual:
            (emailType === "sales_single" || emailType === "sales_sequence_7") && offerManual
              ? {
                  name: safeString(offerManual.name).trim() || null,
                  promise: safeString(offerManual.promise).trim() || null,
                  main_outcome: safeString(offerManual.main_outcome).trim() || null,
                  description: safeString(offerManual.description).trim() || null,
                  price: safeString(offerManual.price).trim() || null,
                }
              : undefined,
          formality,
        } as any);
      }

      if (type === "article") {
        const step = normalizeArticleStep(body.articleStep);
        const objective = normalizeArticleObjective(body.objective);
        if (!objective) return buildPromptByType({ type: "generic", prompt: prompt || "Article" });

        const subject =
          safeString(body.subject).trim() ||
          safeString(body.theme).trim() ||
          prompt ||
          "Article";

        const primaryKeyword = safeString(body.seoKeyword).trim() || undefined;
        const secondaryKeywords = parseSecondaryKeywords(safeString(body.secondaryKeywords));
        const links = parseLinks(safeString(body.links));
        const ctaText = safeString(body.ctaText).trim() || safeString(body.cta).trim() || null;
        const ctaLink = safeString(body.ctaLink).trim() || null;
        const approvedPlan = safeString(body.approvedPlan).trim() || null;

        return buildArticlePrompt({
          step,
          subject,
          objective,
          primaryKeyword,
          secondaryKeywords: secondaryKeywords.length ? secondaryKeywords : undefined,
          links: links.length ? links : undefined,
          ctaText,
          ctaLink,
          approvedPlan: step === "write" ? approvedPlan : null,
        } as any);
      }

      if (type === "offer") {
        const theme = safeString(body.theme).trim() || safeString(body.subject).trim() || prompt || "Offre";
        const offerType = normalizeOfferType(body.offerType);
        if (!offerType) return buildPromptByType({ type: "generic", prompt: theme });

        const leadMagnetFormat = safeString(body.leadMagnetFormat).trim() || undefined;
        const target = safeString(body.target).trim() || undefined;

        return buildOfferPrompt({
          offerMode,
          offerType,
          theme,
          target,
          leadMagnetFormat,
          sourceOffer: offerMode === "from_pyramid" ? sourceOffer : null,
          language: "fr",
        } as any);
      }

      return buildPromptByType({ type: "generic", prompt: prompt || safeString(body.subject).trim() || "Contenu" });
    })();

    const matchPrompt =
      type === "post"
        ? safeString(body.subject).trim() || safeString(body.theme).trim() || prompt
        : type === "email"
          ? safeString(body.subject).trim() || prompt
          : type === "article"
            ? safeString(body.subject).trim() || safeString(body.seoKeyword).trim() || prompt
            : type === "video"
              ? safeString(body.subject).trim() || prompt
              : type === "offer"
                ? offerMode === "from_pyramid"
                  ? (sourceOffer?.name ?? sourceOffer?.promise ?? sourceOffer?.description ?? "offre_pyramide")
                  : safeString(body.theme).trim() || safeString(body.subject).trim() || prompt
                : prompt;

    /** ---------------------------
     * Context builder
     * -------------------------- */

    const userContextLines: string[] = [];
    userContextLines.push(`Type: ${type}`);
    if (channel) userContextLines.push(`Canal: ${channel}`);
    if (scheduledDate) userContextLines.push(`Date planifiée: ${scheduledDate}`);
    if (tagsCsv) userContextLines.push(`Tags: ${tagsCsv}`);

    if (type === "video") {
      if (body.platform) userContextLines.push(`Plateforme: ${safeString(body.platform).trim()}`);
      if (body.duration) userContextLines.push(`Durée: ${safeString(body.duration).trim()}`);
      if (typeof body.targetWordCount === "number") userContextLines.push(`TargetWordCount: ${body.targetWordCount}`);
    }

    if (type === "offer") {
      if (body.offerType) userContextLines.push(`OfferType: ${safeString(body.offerType).trim()}`);
      userContextLines.push(`OfferMode: ${offerMode}`);
      if (offerMode === "from_pyramid") {
        userContextLines.push("SourceOffer (JSON):");
        userContextLines.push(JSON.stringify(sourceOffer));
      }
    }

    userContextLines.push("");
    userContextLines.push("Persona client (si disponible) :");
    userContextLines.push(personaContext ? JSON.stringify(personaContext) : "Aucun persona.");

    userContextLines.push("");
    userContextLines.push("Business profile (si disponible) :");
    userContextLines.push(profile ? JSON.stringify(profile) : "Aucun profil.");

    userContextLines.push("");
    userContextLines.push("Business plan (si disponible) :");
    userContextLines.push(planJson ? JSON.stringify(planJson) : "Aucun plan.");

    // ✅ Tipote Knowledge injection
    try {
      const knowledgeSnippets = await getKnowledgeSnippets({ type, prompt: matchPrompt || effectivePrompt, tags });
      if (knowledgeSnippets.length) {
        userContextLines.push("");
          userContextLines.push("Tipote Knowledge (ressources internes à utiliser pour élever la qualité) :");
          knowledgeSnippets.forEach((k, idx) => {
            userContextLines.push("");
            userContextLines.push(`Ressource ${idx + 1}: ${k.title}`);
            userContextLines.push(`Source: ${k.source}`);
            userContextLines.push("Extrait:");
            userContextLines.push(k.snippet);
          });
        }
      } catch {
        // fail-open
      }

      userContextLines.push("");
      userContextLines.push("Brief :");
      userContextLines.push(effectivePrompt);

      /** ---------------------------
       * Async job = placeholder row dans content_item
       * -------------------------- */

      const generatingStatus = "generating";
      const finalStatus = scheduledDate ? "scheduled" : "draft";

      // Placeholder (content vide) => jobId = content_item.id
      const placeholderEN = await insertContentEN({
        supabase,
        userId,
        type,
        title: null,
        content: "",
        channel,
        scheduledDate,
        tags,
        tagsCsv,
        status: generatingStatus,
      });

      let jobId: string | null = null;
      let schema: "en" | "fr" = "en";

      if (!placeholderEN.error && placeholderEN.data?.id) {
        jobId = String((placeholderEN.data as any).id);
        schema = "en";
      } else {
        const enErr = placeholderEN.error as PostgrestError | null;
        if (!isMissingColumnError(enErr?.message)) {
          return NextResponse.json({ ok: false, error: enErr?.message ?? "Insert error" }, { status: 400 });
        }

        const placeholderFR = await insertContentFR({
          supabase,
          userId,
          type,
          title: null,
          content: "",
          channel,
          scheduledDate,
          tags,
          tagsCsv,
          status: generatingStatus,
        });

        if (placeholderFR.error || !placeholderFR.data?.id) {
          return NextResponse.json(
            { ok: false, error: (placeholderFR.error as any)?.message ?? "Insert error" },
            { status: 400 },
          );
        }

        jobId = String((placeholderFR.data as any).id);
        schema = "fr";
      }

      // Fire-and-forget: génération + update de la row
      // Si crash => la row reste "generating" (acceptable)
      void (async () => {
        try {
          const raw = await callClaude({
            apiKey,
            system: systemPrompt,
            user: userContextLines.join("\n"),
          });

          const cleaned = type === "article" ? toPlainTextKeepBold(raw) : toPlainText(raw);
          const finalContent = cleaned?.trim() ?? "";
          if (!finalContent) throw new Error("Empty content from model");

          const title = (() => {
            const firstLine = finalContent.split("\n").find((l) => l.trim()) ?? null;
            if (!firstLine) return null;
            const t = firstLine.replace(/^#+\s*/, "").trim();
            if (!t) return null;
            return t.slice(0, 120);
          })();

          // ✅ Consomme 1 crédit uniquement si génération OK (après succès IA)
          try {
            await consumeCredits(userId, 1, {
              kind: "content_generate",
              type,
              job_id: jobId,
              channel,
              scheduled_date: scheduledDate,
              tags: tagsCsv,
            });
          } catch (e) {
            const code = (e as any)?.code || (e as any)?.message;
            if (code === "NO_CREDITS") {
              throw new Error("NO_CREDITS");
            }
            // fail-open: si RPC plante (rare), on ne bloque pas la sauvegarde
          }

          if (schema === "en") {
            const upd = await updateContentEN({
              supabase,
              id: jobId!,
              title,
              content: finalContent,
              status: finalStatus,
              tags,
              tagsCsv,
            });

            if (upd.error) {
              const e = upd.error as PostgrestError | null;
              if (isMissingColumnError(e?.message)) {
                await updateContentFR({
                  supabase,
                  id: jobId!,
                  title,
                  content: finalContent,
                  status: finalStatus,
                  tags,
                  tagsCsv,
                });
              }
            }
          } else {
            const upd = await updateContentFR({
              supabase,
              id: jobId!,
              title,
              content: finalContent,
              status: finalStatus,
              tags,
              tagsCsv,
            });

            if (upd.error) {
              const e = upd.error as PostgrestError | null;
              if (isMissingColumnError(e?.message)) {
                await updateContentEN({
                  supabase,
                  id: jobId!,
                  title,
                  content: finalContent,
                  status: finalStatus,
                  tags,
                  tagsCsv,
                });
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";

          // Best-effort: repasse en draft avec message minimal
          try {
            if (schema === "en") {
              await updateContentEN({
                supabase,
                id: jobId!,
                title: msg === "NO_CREDITS" ? "Crédits insuffisants" : "Erreur génération",
                content: msg === "NO_CREDITS" ? "Erreur: NO_CREDITS" : `Erreur: ${msg}`,
                status: "draft",
                tags,
                tagsCsv,
              });
            } else {
              await updateContentFR({
                supabase,
                id: jobId!,
                title: msg === "NO_CREDITS" ? "Crédits insuffisants" : "Erreur génération",
                content: msg === "NO_CREDITS" ? "Erreur: NO_CREDITS" : `Erreur: ${msg}`,
                status: "draft",
                tags,
                tagsCsv,
              });
            }
          } catch {
            // ignore
          }
        }
      })();

      // Réponse immédiate (async)
      return NextResponse.json(
        {
          ok: true,
          jobId,
          provider: "claude" as Provider,
          status: generatingStatus,
          note:
            "Génération en cours. Poll la ressource content_item par jobId (ex: GET /api/content/[id]) pour récupérer le contenu.",
        },
        { status: 202 },
      );
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
        { status: 500 },
      );
    }
  }
