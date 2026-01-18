// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item
// ✅ Fix compile TS : getDecryptedUserApiKey(params) attend 1 seul argument (objet), et retourne string|null
// ✅ A5 — Gating :
//    - Plans payants (basic/essential/elite) => OK
//    - Plan free => quota 7 contenus / 7 jours glissants (même si clé user configurée)
// ✅ Cohérence calendrier : scheduledDate stockée en YYYY-MM-DD et status "scheduled" si date.
// ✅ Compat DB : tags peut être array OU texte CSV -> insert avec retry.
// ✅ Output : texte brut (pas de markdown)
// ✅ Knowledge : injecte tipote-knowledge via manifest (xlsx) + lecture des ressources
// ✅ Persona : lit public.personas (persona_json + colonnes lisibles) et injecte dans le prompt.

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getDecryptedUserApiKey } from "@/lib/userApiKeys";

import fs from "node:fs/promises";
import path from "node:path";

type Provider = "openai" | "claude" | "gemini";

type Body = {
  type?: string;
  provider?: Provider;
  channel?: string;
  scheduledDate?: string | null;
  tags?: string[];
  prompt?: string;

  // compat legacy
  brief?: string;
  consigne?: string;
  angle?: string;
  text?: string;
};

function safeString(x: unknown): string {
  if (typeof x === "string") return x;
  return "";
}

function normalizeProvider(x: unknown): Provider {
  const s = safeString(x).trim().toLowerCase();
  if (s === "claude") return "claude";
  if (s === "gemini") return "gemini";
  return "openai";
}

function isoDateOrNull(x: unknown): string | null {
  const s = safeString(x).trim();
  if (!s) return null;

  // Accepte YYYY-MM-DD directement
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Accepte ISO -> convertit en YYYY-MM-DD
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

function maskKey(key: string | null): string {
  const s = (key ?? "").trim();
  if (!s) return "••••••••";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
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
  // fallback CSV
  return v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coercePersonaJson(v: unknown): Record<string, any> | null {
  if (isRecord(v)) return v;
  const parsed = safeJsonParse<unknown>(v);
  return isRecord(parsed) ? (parsed as Record<string, any>) : null;
}

function toPlainText(input: string): string {
  let s = (input ?? "").replace(/\r\n/g, "\n");

  // Remove fenced code blocks (keep inner content)
  s = s.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_m, code) => String(code ?? "").trim());

  // Convert markdown links to text: [label](url) -> label
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  // Remove headings, blockquotes
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");

  // Remove list markers (-, *, +, 1.)
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, "");
  s = s.replace(/^\s{0,3}\d+\.\s+/gm, "");

  // Remove emphasis/bold/code markers
  s = s.replace(/\*\*(.*?)\*\*/g, "$1");
  s = s.replace(/__(.*?)__/g, "$1");
  s = s.replace(/\*(.*?)\*/g, "$1");
  s = s.replace(/_(.*?)_/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");

  // Normalize bullets (avoid markdown-like)
  s = s.replace(/^[•●▪︎■]\s+/gm, "- ");

  // Collapse extra blank lines
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return s;
}

// Insert EN (schéma older)
// - certaines DB ont tags en texte, d'autres en array => on tente array puis CSV
async function insertContentEN(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  type: string;
  title: string | null;
  content: string;
  channel: string | null;
  scheduledDate: string | null; // YYYY-MM-DD
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

// Insert FR (schéma prod)
// - certaines DB ont tags en texte, d'autres en array => on tente array puis CSV
async function insertContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  type: string;
  title: string | null;
  content: string;
  channel: string | null;
  scheduledDate: string | null; // YYYY-MM-DD
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

/** ---------------------------
 * Tipote Knowledge (manifest + ressources)
 * - On reste fail-open (si xlsx/module/paths manquent => on n'explose pas)
 * - On limite à quelques snippets pertinents pour ne pas polluer le prompt
 * -------------------------- */

type KnowledgeEntry = {
  title: string;
  tags: string[];
  relPath: string; // path relatif (depuis root)
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

  // Dynamic import pour éviter de casser si module absent
  let XLSX: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    XLSX = require("xlsx");
  } catch {
    // Pas de parse xlsx -> fail-open
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
    // fallback : certaines entrées peuvent être relatives à tipote-knowledge directement
    try {
      const alt = path.join(root, "tipote-knowledge", cleanRel);
      buf = await fs.readFile(alt, "utf8");
    } catch {
      return null;
    }
  }

  // Nettoyage léger
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

    out.push({
      title: it.e.title,
      snippet,
      source: it.e.relPath,
    });

    if (out.length >= 4) break;
  }

  return out;
}

async function isPaidOrThrowQuota(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
}): Promise<
  | { ok: true; paid: true }
  | { ok: true; paid: false; used: number; limit: number; windowDays: number }
  | { ok: true; paid: false; used: null; limit: number; windowDays: number }
> {
  const { supabase, userId } = params;

  // 1) Plan
  try {
    const { data: billingProfile, error: billingError } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    if (!billingError) {
      const plan = (billingProfile as any)?.plan as string | null | undefined;
      const p = (plan ?? "").toLowerCase().trim();
      const paid = p === "basic" || p === "essential" || p === "elite";
      if (paid) return { ok: true, paid: true };
    }
  } catch {
    // fail-open
    return { ok: true, paid: false, used: null, limit: 7, windowDays: 7 };
  }

  // 2) Quota free (7 / 7 jours glissants)
  const limit = 7;
  const windowDays = 7;
  try {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // count exact, head: true to avoid fetching rows
    const { count, error } = await supabase
      .from("content_item")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (error) {
      // Si colonne manquante etc => fail-open (ne pas casser)
      if (isMissingColumnError(error.message)) {
        return { ok: true, paid: false, used: null, limit, windowDays };
      }
      return { ok: true, paid: false, used: null, limit, windowDays };
    }

    return { ok: true, paid: false, used: typeof count === "number" ? count : 0, limit, windowDays };
  } catch {
    return { ok: true, paid: false, used: null, limit, windowDays };
  }
}

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
    const provider = normalizeProvider(body?.provider);
    const channel = safeString(body?.channel).trim() || null;
    const scheduledDate = isoDateOrNull(body?.scheduledDate ?? null);
    const tags = Array.isArray(body?.tags) ? body.tags.filter(Boolean).map(String) : [];

    const prompt =
      safeString(body?.prompt).trim() ||
      safeString(body?.brief).trim() ||
      safeString(body?.consigne).trim() ||
      safeString(body?.angle).trim() ||
      safeString(body?.text).trim();

    if (!type) {
      return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ ok: false, error: "Missing prompt" }, { status: 400 });
    }

    // UI peut proposer Claude/Gemini, mais backend pas activé -> réponse propre
    if (provider !== "openai") {
      return NextResponse.json(
        { ok: false, error: `Provider "${provider}" pas encore activé côté backend.` },
        { status: 501 },
      );
    }

    // ✅ Clé user (si dispo) — toujours prioritaire
    const ownerKey = process.env.OPENAI_API_KEY ?? "";
    const userKey = await getDecryptedUserApiKey({
      supabase,
      userId,
      provider: "openai",
    });

    // ✅ Nouveau gating : plan payant => OK ; plan free => quota hebdo (même si userKey)
    const gate = await isPaidOrThrowQuota({ supabase, userId });
    if (!gate.paid) {
      // Si on a pu compter, on applique strictement le quota
      if (typeof gate.used === "number") {
        if (gate.used >= gate.limit) {
          return NextResponse.json(
            {
              ok: false,
              code: "free_quota_reached",
              error: `Limite atteinte : ${gate.limit} contenus / ${gate.windowDays} jours. Choisissez un abonnement pour continuer.`,
              meta: { limit: gate.limit, windowDays: gate.windowDays, used: gate.used },
            },
            { status: 402 },
          );
        }
      }
      // Si on ne peut pas compter (fail-open), on laisse passer
    }

    const apiKey = (userKey ?? ownerKey).trim();

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Aucune clé OpenAI configurée (user ou owner)." },
        { status: 400 },
      );
    }

    // Contexte (optionnel) : business profile + plan
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: planRow } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    // ✅ Persona (optionnel) : public.personas
    let personaContext: any = null;
    try {
      const { data: personaRow, error: personaErr } = await supabase
        .from("personas")
        .select(
          "persona_json,name,role,description,pains,desires,objections,current_situation,desired_situation,awareness_level,budget_level,updated_at",
        )
        .eq("user_id", userId)
        .eq("role", "client_ideal")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (personaErr) {
        if (!isMissingColumnError(personaErr.message)) {
          console.error("Error loading personas:", personaErr);
        }
      } else if (personaRow) {
        const pj = coercePersonaJson((personaRow as any).persona_json);

        personaContext =
          pj ??
          {
            title: (personaRow as any).name ?? null,
            current_situation: (personaRow as any).current_situation ?? null,
            desired_situation: (personaRow as any).desired_situation ?? null,
            awareness_level: (personaRow as any).awareness_level ?? null,
            budget_level: (personaRow as any).budget_level ?? null,
            pains: arrayFromTextOrJson((personaRow as any).pains),
            desires: arrayFromTextOrJson((personaRow as any).desires),
            objections: arrayFromTextOrJson((personaRow as any).objections),
            description: (personaRow as any).description ?? null,
          };
      }
    } catch (e) {
      // fail-open
      console.error("Persona load (fail-open):", e);
    }

    const planJson = (planRow as any)?.plan_json ?? null;

    const client = new OpenAI({ apiKey });

    const tagsCsv = joinTagsCsv(tags);

    // ✅ Plain text output
    const systemPrompt = [
      "Tu es Tipote, un assistant business & contenu.",
      "Tu écris en français, avec un style clair, pro, actionnable.",
      "Tu ne mentionnes pas que tu es une IA.",
      "Tu rends un contenu final prêt à publier.",
      "IMPORTANT: format texte brut (plain text).",
      "Interdit: markdown (pas de #, pas de **, pas de listes numérotées '1.', pas de backticks).",
      "Si tu structures: sauts de lignes + tirets simples '- ' uniquement.",
      "Pas de blabla meta, pas de disclaimers, pas d'intro inutiles.",
      "Tu adaptes ton vocabulaire, tes angles, et tes CTA au persona (douleurs, désirs, objections, déclencheurs d'achat).",
      "Tu tiens compte de l'onboarding (business profile) et du business plan si disponibles.",
    ].join("\n");

    const userContextLines: string[] = [];
    userContextLines.push(`Type: ${type}`);
    if (channel) userContextLines.push(`Canal: ${channel}`);
    if (scheduledDate) userContextLines.push(`Date planifiée : ${scheduledDate}`);
    if (tagsCsv) userContextLines.push(`Tags: ${tagsCsv}`);

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
      const knowledgeSnippets = await getKnowledgeSnippets({ type, prompt, tags });
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
    userContextLines.push(prompt);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContextLines.join("\n") },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const content = toPlainText(raw);

    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty content from model" }, { status: 502 });
    }

    const title = (() => {
      const firstLine = content.split("\n").find((l) => l.trim()) ?? null;
      if (!firstLine) return null;
      const t = firstLine.replace(/^#+\s*/, "").trim();
      if (!t) return null;
      return t.slice(0, 120);
    })();

    const status = scheduledDate ? "scheduled" : "draft";

    const tryEN = await insertContentEN({
      supabase,
      userId,
      type,
      title,
      content,
      channel,
      scheduledDate,
      tags,
      tagsCsv,
      status,
    });

    if (!tryEN.error) {
      return NextResponse.json(
        {
          ok: true,
          id: tryEN.data?.id,
          title: (tryEN.data as any)?.title ?? title,
          content,
          usedUserKey: Boolean(userKey),
          maskedKey: maskKey(apiKey),
        },
        { status: 200 },
      );
    }

    const enErr = tryEN.error as PostgrestError | null;
    if (!isMissingColumnError(enErr?.message)) {
      return NextResponse.json({ ok: false, error: enErr?.message ?? "Insert error" }, { status: 400 });
    }

    const tryFR = await insertContentFR({
      supabase,
      userId,
      type,
      title,
      content,
      channel,
      scheduledDate,
      tags,
      tagsCsv,
      status,
    });

    if (tryFR.error) {
      return NextResponse.json(
        { ok: false, error: (tryFR.error as any)?.message ?? "Insert error" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: (tryFR.data as any)?.id,
        title: (tryFR.data as any)?.titre ?? title,
        content,
        usedUserKey: Boolean(userKey),
        maskedKey: maskKey(apiKey),
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
