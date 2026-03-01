// app/api/pages/generate/route.ts
// SSE endpoint: generates a full hosted page (capture/sales) using AI.
// Streams progress steps so the UI can show "Je rédige ton texte de vente", etc.
// Costs 1 credit. Returns the created page ID at the end.

import { NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getOwnerOpenAI, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { inferTemplateSchema, schemaToPrompt } from "@/lib/templates/schema";
import { renderTemplateHtml } from "@/lib/templates/render";
import { searchResourceChunks } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---------- Types ----------

const InputSchema = z.object({
  pageType: z.enum(["capture", "sales"]),
  // Optional: user can specify a template, otherwise Tipote picks the best one
  templateId: z.string().optional(),
  // User's offer info (optional - will use profile data if not provided)
  offerName: z.string().optional(),
  offerPromise: z.string().optional(),
  offerTarget: z.string().optional(),
  offerPrice: z.string().optional(),
  offerDescription: z.string().optional(),
  // New fields from "from scratch" flow
  offerGuarantees: z.string().optional(),
  offerUrgency: z.string().optional(),
  offerBenefits: z.string().optional(),
  // Payment / CTA
  paymentUrl: z.string().optional(),
  paymentButtonText: z.string().optional(),
  // Custom theme/brief
  theme: z.string().optional(),
  // Video embed
  videoEmbedUrl: z.string().optional(),
  // Language (defaults to user's content_locale from profile)
  locale: z.string().optional(),
});

// ---------- Template selection scoring ----------

type TemplateScore = { id: string; score: number };

const TEMPLATE_NICHE_FIT: Record<string, Record<string, number>> = {
  // capture templates
  "capture-01": { coaching: 9, formation: 8, "bien-etre": 7, business: 8, default: 7 },
  "capture-02": { coaching: 8, consulting: 9, "developpement_perso": 8, default: 7 },
  "capture-03": { "bien-etre": 9, spiritualite: 9, yoga: 9, default: 6 },
  "capture-04": { business: 9, coaching: 8, formation: 8, default: 7 },
  "capture-05": { fitness: 9, sport: 9, "perte-poids": 9, default: 6 },
  // sales templates
  "sale-01": { business: 9, event: 10, seminaire: 10, formation: 8, default: 7 },
  "sale-02": { coaching: 9, formation: 9, business: 8, default: 7 },
  "sale-03": { "bien-etre": 9, coaching: 8, default: 7 },
  "sale-04": { business: 9, consulting: 9, formation: 8, default: 7 },
  "sale-05": { coaching: 8, lifestyle: 8, default: 7 },
  "sale-06": { business: 8, consulting: 8, default: 7 },
  "sale-07": { "bien-etre": 9, spiritualite: 8, default: 6 },
  "sale-08": { fitness: 9, sport: 8, "perte-poids": 9, default: 6 },
  "sale-09": { video: 9, formation: 8, business: 7, default: 6 },
  "sale-10": { business: 8, coaching: 8, default: 7 },
  "sale-11": { formation: 9, elearning: 10, business: 8, default: 7 },
  "sale-12": { lifestyle: 8, fun: 8, default: 7 },
  "sale-13": { business: 8, coaching: 8, default: 7 },
};

function pickBestTemplate(pageType: "capture" | "sales", niche: string): string {
  const prefix = pageType === "capture" ? "capture-" : "sale-";
  const nicheKey = (niche || "").toLowerCase().replace(/\s+/g, "_");

  const candidates: TemplateScore[] = [];
  for (const [id, fits] of Object.entries(TEMPLATE_NICHE_FIT)) {
    if (!id.startsWith(prefix)) continue;
    const score = fits[nicheKey] ?? fits.default ?? 5;
    candidates.push({ id, score });
  }

  if (candidates.length === 0) return pageType === "capture" ? "capture-01" : "sale-02";

  // Sort by score descending, add a little randomness among top scorers
  candidates.sort((a, b) => b.score - a.score);
  const topScore = candidates[0].score;
  const topCandidates = candidates.filter((c) => c.score >= topScore - 1);
  return topCandidates[Math.floor(Math.random() * topCandidates.length)].id;
}

// ---------- Slug generation ----------

function generateSlug(title: string): string {
  const base = (title || "ma-page")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

// ---------- SSE helpers ----------

function sseEncode(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------- Main handler ----------

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const userId = session.user.id;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const input = parsed.data;

  // Check credits: 5 for capture, 7 for sales
  const creditCost = input.pageType === "sales" ? 7 : 5;
  const balance = await ensureUserCredits(userId);
  if (balance.total_remaining < creditCost) {
    return new Response(JSON.stringify({ error: `Crédits insuffisants (${creditCost} crédits requis).`, code: "NO_CREDITS", upgrade_url: "/settings?tab=billing" }), { status: 402, headers: { "content-type": "application/json" } });
  }

  const openai = getOwnerOpenAI();
  if (!openai) {
    return new Response(JSON.stringify({ error: "OpenAI non configuré." }), { status: 500, headers: { "content-type": "application/json" } });
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try { controller.enqueue(encoder.encode(sseEncode(event, data))); } catch { /* closed */ }
      };

      try {
        // ==================== STEP 1: Analyze user profile ====================
        send("step", { id: "profile", label: "J'analyse ton profil et ton activité...", progress: 5 });

        const projectId = await getActiveProjectId(supabase, userId).catch(() => null);

        // Fetch business profile
        let profileQuery = supabaseAdmin.from("business_profiles").select("*").eq("user_id", userId);
        if (projectId) profileQuery = profileQuery.eq("project_id", projectId);
        const { data: profile } = await profileQuery.maybeSingle();

        const niche = (profile as any)?.niche || "";
        const firstName = (profile as any)?.first_name || "";
        const country = (profile as any)?.country || "France";
        const mission = (profile as any)?.mission || "";
        const toneOfVoice = (profile as any)?.brand_tone_of_voice || (profile as any)?.preferred_tone || "";
        const brandFont = (profile as any)?.brand_font || "";
        const brandColorBase = (profile as any)?.brand_color_base || "";
        const brandColorAccent = (profile as any)?.brand_color_accent || "";
        const brandLogoUrl = (profile as any)?.brand_logo_url || "";
        const brandAuthorPhoto = (profile as any)?.brand_author_photo_url || "";
        const privacyUrl = (profile as any)?.privacy_url || "";
        const termsUrl = (profile as any)?.terms_url || "";
        const cgvUrl = (profile as any)?.cgv_url || "";
        const contentLocale = input.locale || ((profile as any)?.content_locale ?? "fr").trim() || "fr";

        send("step", { id: "profile", label: "J'analyse ton profil et ton activité...", progress: 10, done: true });

        // ==================== STEP 2: Pick best template ====================
        send("step", { id: "template", label: "Je choisis le meilleur design pour ta niche...", progress: 15 });

        const templateKind = input.pageType === "sales" ? "vente" : "capture";
        const templateId = input.templateId || pickBestTemplate(input.pageType, niche);

        send("step", { id: "template", label: "Je choisis le meilleur design pour ta niche...", progress: 20, done: true, templateId });

        // ==================== STEP 3: Load template schema ====================
        send("step", { id: "schema", label: "Je prépare la structure de ta page...", progress: 25 });

        const schema = await inferTemplateSchema({ kind: templateKind, templateId });
        const schemaPrompt = schemaToPrompt(schema);

        send("step", { id: "schema", label: "Je prépare la structure de ta page...", progress: 30, done: true });

        // ==================== STEP 4: Search knowledge resources ====================
        send("step", { id: "knowledge", label: "Je m'inspire des meilleures pages de vente...", progress: 35 });

        let knowledgeSnippets: string[] = [];
        try {
          const query = `${input.pageType === "sales" ? "page de vente" : "page de capture"} ${niche} ${input.offerName || ""} conversion copywriting`;
          const chunks = await searchResourceChunks({ query, matchCount: 5, matchThreshold: 0.45 });
          knowledgeSnippets = chunks.map((c) => c.content);
        } catch { /* fail-open */ }

        send("step", { id: "knowledge", label: "Je m'inspire des meilleures pages de vente...", progress: 40, done: true });

        // ==================== STEP 5: Generate copywriting ====================
        send("step", { id: "copy", label: input.pageType === "sales" ? "Je rédige ton texte de vente..." : "Je rédige ton texte de capture...", progress: 45 });

        // Build the AI prompt
        const systemPrompt = buildPageSystemPrompt({
          pageType: input.pageType,
          schemaPrompt,
          niche,
          toneOfVoice,
          knowledgeSnippets,
          language: contentLocale,
        });

        const userPrompt = buildPageUserPrompt({
          pageType: input.pageType,
          offerName: input.offerName || "",
          offerPromise: input.offerPromise || "",
          offerTarget: input.offerTarget || "",
          offerPrice: input.offerPrice || "",
          offerDescription: input.offerDescription || "",
          offerGuarantees: input.offerGuarantees || "",
          offerUrgency: input.offerUrgency || "",
          offerBenefits: input.offerBenefits || "",
          theme: input.theme || "",
          firstName,
          niche,
          mission,
          profile,
          paymentUrl: input.paymentUrl || "",
          paymentButtonText: input.paymentButtonText || "",
        });

        const completion = await openai.chat.completions.create({
          ...cachingParams("page_generate"),
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: 8000,
          temperature: 0.7,
        } as any);

        const raw = completion.choices?.[0]?.message?.content?.trim() || "";

        send("step", { id: "copy", label: input.pageType === "sales" ? "Je rédige ton texte de vente..." : "Je rédige ton texte de capture...", progress: 60, done: true });

        // ==================== STEP 6: Parse + apply to template ====================
        send("step", { id: "design", label: "Je crée ton design personnalisé...", progress: 65 });

        // Extract JSON from AI response
        const jsonStr = extractFirstJson(raw);
        if (!jsonStr) throw new Error("L'IA n'a pas retourné de contenu valide.");

        let contentData: Record<string, any>;
        try {
          contentData = JSON.parse(jsonStr);
        } catch {
          throw new Error("Erreur de parsing du contenu généré.");
        }

        // Inject user-provided data
        if (brandLogoUrl && !contentData.logo_image_url) contentData.logo_image_url = brandLogoUrl;
        if (brandAuthorPhoto && !contentData.author_photo_url) contentData.author_photo_url = brandAuthorPhoto;
        if (firstName && !contentData.about_name) contentData.about_name = firstName;
        if (input.videoEmbedUrl) contentData.video_embed_url = input.videoEmbedUrl;

        send("step", { id: "design", label: "Je crée ton design personnalisé...", progress: 75, done: true });

        // ==================== STEP 7: Apply branding ====================
        send("step", { id: "branding", label: "J'applique ton identité visuelle...", progress: 78 });

        const brandTokens: Record<string, any> = {};
        if (brandColorBase) brandTokens["colors-primary"] = brandColorBase;
        if (brandColorAccent) brandTokens["colors-accent"] = brandColorAccent;
        if (brandFont) brandTokens["typography-heading"] = brandFont;

        send("step", { id: "branding", label: "J'applique ton identité visuelle...", progress: 82, done: true });

        // ==================== STEP 8: Add legal compliance ====================
        send("step", { id: "legal", label: "J'ajoute tes mentions légales...", progress: 85 });

        if (cgvUrl && !contentData.legal_cgv_url) contentData.legal_cgv_url = cgvUrl;
        if (privacyUrl && !contentData.legal_privacy_url) contentData.legal_privacy_url = privacyUrl;
        if (termsUrl && !contentData.legal_mentions_url) contentData.legal_mentions_url = termsUrl;

        send("step", { id: "legal", label: "J'ajoute tes mentions légales...", progress: 88, done: true });

        // ==================== STEP 9: Render HTML ====================
        send("step", { id: "render", label: "J'optimise ta page pour les téléphones...", progress: 90 });

        const { html: renderedHtml } = await renderTemplateHtml({
          kind: templateKind,
          templateId,
          mode: "preview",
          contentData,
          brandTokens: Object.keys(brandTokens).length > 0 ? brandTokens : null,
        });

        send("step", { id: "render", label: "J'optimise ta page pour les téléphones...", progress: 93, done: true });

        // ==================== STEP 10: Save to database ====================
        send("step", { id: "save", label: input.paymentUrl ? "Je mets en place ton lien de paiement..." : "Je sauvegarde ta page...", progress: 95 });

        const title = contentData.hero_title || contentData.headline || contentData.main_headline || "Ma page";
        const slug = generateSlug(title);

        const pageRow = {
          user_id: userId,
          project_id: projectId,
          title: String(title).slice(0, 200),
          slug,
          page_type: input.pageType,
          status: "draft" as const,
          template_kind: templateKind,
          template_id: templateId,
          content_data: contentData,
          brand_tokens: brandTokens,
          html_snapshot: renderedHtml,
          video_embed_url: input.videoEmbedUrl || "",
          payment_url: input.paymentUrl || "",
          payment_button_text: input.paymentButtonText || "",
          meta_title: String(title).slice(0, 60),
          meta_description: (contentData.hero_subtitle || contentData.hero_description || "").slice(0, 160),
          legal_mentions_url: termsUrl,
          legal_cgv_url: cgvUrl,
          legal_privacy_url: privacyUrl,
          locale: contentLocale,
        };

        const { data: page, error: insertError } = await supabaseAdmin
          .from("hosted_pages")
          .insert(pageRow)
          .select("id, slug")
          .single();

        if (insertError || !page) {
          throw new Error(insertError?.message || "Erreur lors de la sauvegarde.");
        }

        // Consume credits: 5 for capture, 7 for sales
        try {
          await consumeCredits(userId, creditCost, {
            kind: "page_generate",
            page_type: input.pageType,
            template_id: templateId,
            page_id: page.id,
          });
        } catch { /* fail-open for credits */ }

        send("step", { id: "save", label: input.paymentUrl ? "Je mets en place ton lien de paiement..." : "Je sauvegarde ta page...", progress: 100, done: true });

        // ==================== DONE ====================
        send("done", {
          pageId: page.id,
          slug: page.slug,
          templateId,
          title,
        });
      } catch (err: any) {
        send("error", { message: err?.message || "Erreur inconnue" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ---------- Prompt builders ----------

function buildPageSystemPrompt(params: {
  pageType: "capture" | "sales";
  schemaPrompt: string;
  niche: string;
  toneOfVoice: string;
  knowledgeSnippets: string[];
  language?: string;
}): string {
  const lines: string[] = [];

  lines.push("Tu es Tipote, un copywriter direct-response expert de niveau mondial.");
  lines.push("Tu crées des pages web qui CONVERTISSENT, pas des pages génériques.");
  lines.push("");

  if (params.pageType === "capture") {
    lines.push("OBJECTIF : Créer une page de capture irrésistible qui pousse le visiteur à laisser son email.");
    lines.push("Structure persuasive : Hook → Promesse → Bénéfices → Preuve sociale → CTA → Réassurance");
  } else {
    lines.push("OBJECTIF : Créer une page de vente qui VEND. Chaque mot doit rapprocher le prospect de l'achat.");
    lines.push("Structure : Hook → Problème → Agitation → Solution → Mécanisme → Preuves → Offre → Objections → Urgence → Garantie → CTA");
  }
  lines.push("");

  lines.push("RÈGLES CRITIQUES DE COPYWRITING :");
  lines.push("- Parle directement au prospect (tu/vous selon le ton de la marque)");
  lines.push("- Chaque titre doit créer de la curiosité ou de l'urgence");
  lines.push("- Les bénéfices avant les caractéristiques, TOUJOURS");
  lines.push("- Utilise des chiffres concrets quand possible (3 étapes, 7 jours, etc.)");
  lines.push("- Les CTA doivent être orientés résultat, pas action (\"Je transforme mon business\" pas \"Cliquer ici\")");
  lines.push("- Les textes doivent sonner comme un expert qui parle à un ami, pas comme un robot");
  lines.push("- Adapte le vocabulaire à la niche et au public cible");
  lines.push("- JAMAIS de phrases vides type \"bienvenue sur notre site\" ou \"nous sommes ravis\"");
  lines.push("");

  if (params.toneOfVoice) {
    lines.push(`TON DE VOIX DE LA MARQUE : ${params.toneOfVoice}`);
    lines.push("Adapte tout le copywriting à ce ton.");
    lines.push("");
  }

  if (params.niche) {
    lines.push(`NICHE : ${params.niche}`);
    lines.push("Utilise le vocabulaire spécifique de cette niche.");
    lines.push("");
  }

  if (params.knowledgeSnippets.length > 0) {
    lines.push("RESSOURCES D'INSPIRATION (pages de vente qui convertissent) :");
    lines.push("Inspire-toi de ces extraits pour la structure, les accroches et les techniques de persuasion.");
    lines.push("NE COPIE PAS mot pour mot — adapte au contexte de l'utilisateur.");
    params.knowledgeSnippets.forEach((s, i) => {
      lines.push(`\n--- Ressource ${i + 1} ---`);
      lines.push(s.slice(0, 1500));
    });
    lines.push("");
  }

  // Language
  const LOCALE_LABELS: Record<string, string> = {
    fr: "français", en: "English", es: "español", it: "italiano",
    pt: "português", de: "Deutsch", nl: "Nederlands", ar: "العربية",
    tr: "Türkçe",
  };
  const lang = params.language || "fr";
  const langLabel = LOCALE_LABELS[lang] ?? lang;
  if (lang !== "fr") {
    lines.push(`LANGUE OBLIGATOIRE : ${langLabel}. Tout le contenu du JSON DOIT être rédigé en ${langLabel}.`);
    lines.push("");
  }

  lines.push("CONTRAINTE DE SORTIE :");
  lines.push("- Retourne UNIQUEMENT un objet JSON valide.");
  lines.push("- Pas de markdown, pas de commentaire, pas de texte autour.");
  lines.push("- Respecte STRICTEMENT le schéma ci-dessous.");
  lines.push("");

  lines.push(params.schemaPrompt);

  return lines.join("\n");
}

function buildPageUserPrompt(params: {
  pageType: "capture" | "sales";
  offerName: string;
  offerPromise: string;
  offerTarget: string;
  offerPrice: string;
  offerDescription: string;
  offerGuarantees: string;
  offerUrgency: string;
  offerBenefits: string;
  theme: string;
  firstName: string;
  niche: string;
  mission: string;
  profile: any;
  paymentUrl: string;
  paymentButtonText: string;
}): string {
  const lines: string[] = [];

  lines.push(`Crée une ${params.pageType === "sales" ? "page de vente" : "page de capture"} pour :`);
  lines.push("");

  if (params.offerName) lines.push(`Offre : ${params.offerName}`);
  if (params.offerPromise) lines.push(`Promesse principale : ${params.offerPromise}`);
  if (params.offerTarget) lines.push(`Public cible : ${params.offerTarget}`);
  if (params.offerPrice) lines.push(`Prix : ${params.offerPrice}`);
  if (params.offerDescription) lines.push(`Description : ${params.offerDescription}`);
  if (params.offerBenefits) lines.push(`Bénéfices concrets :\n${params.offerBenefits}`);
  if (params.offerGuarantees) lines.push(`Garanties : ${params.offerGuarantees}`);
  if (params.offerUrgency) lines.push(`Urgence / Rareté : ${params.offerUrgency}`);
  if (params.theme) lines.push(`Brief/Thème : ${params.theme}`);
  if (params.firstName) lines.push(`Auteur : ${params.firstName}`);
  if (params.niche) lines.push(`Niche : ${params.niche}`);
  if (params.mission) lines.push(`Mission : ${params.mission}`);
  if (params.paymentUrl) lines.push(`Lien de paiement : ${params.paymentUrl}`);
  if (params.paymentButtonText) lines.push(`Texte du bouton paiement : ${params.paymentButtonText}`);

  // Add profile offers if available
  const offers = (params.profile as any)?.offers;
  if (Array.isArray(offers) && offers.length > 0 && !params.offerName) {
    lines.push("");
    lines.push("Offres existantes de l'utilisateur :");
    offers.slice(0, 3).forEach((o: any) => {
      const parts = [];
      if (o.name) parts.push(o.name);
      if (o.type) parts.push(`(${o.type})`);
      if (o.price) parts.push(`${o.price}€`);
      lines.push(`- ${parts.join(" ")}`);
    });
  }

  lines.push("");
  lines.push("IMPORTANT :");
  lines.push("- Remplis TOUS les champs du schéma JSON.");
  lines.push("- Le contenu doit être spécifique à cette offre, PAS générique.");
  lines.push("- Si des informations manquent, invente des contenus plausibles et premium.");
  lines.push("- Retourne uniquement le JSON, rien d'autre.");

  return lines.join("\n");
}

// ---------- Helpers ----------

function extractFirstJson(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const t = (fenced?.[1] ?? s).trim();

  if (t.startsWith("{") || t.startsWith("[")) return t;

  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i >= 0 && j > i) return t.slice(i, j + 1);
  return null;
}
