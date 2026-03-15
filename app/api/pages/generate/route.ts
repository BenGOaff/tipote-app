// app/api/pages/generate/route.ts
// SSE endpoint: generates a full hosted page (capture/sales) using AI.
// Streams progress steps so the UI can show "Je rédige ton texte de vente", etc.
// Costs 1 credit. Returns the created page ID at the end.
// ✅ Uses Claude (Anthropic) for content generation — NOT OpenAI.

import { NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildPage } from "@/lib/pageBuilder";
import { searchResourceChunks } from "@/lib/resources";
import { universalSchemaToPrompt } from "@/lib/templates/universalSchema";
import { buildCopywritingKnowledge } from "@/lib/knowledge/salesPageKnowledge";
import { buildNichePrompt } from "@/lib/knowledge/nicheRecommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---------- Claude AI ----------

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return process.env.CLAUDE_API_KEY_OWNER?.trim() || process.env.ANTHROPIC_API_KEY_OWNER?.trim() || "";
}

function resolveClaudeModel(): string {
  const raw =
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "";
  const v = (raw || "").trim();
  const DEFAULT = "claude-sonnet-4-5-20250929";
  if (!v) return DEFAULT;
  const s = v.toLowerCase();
  if (s === "sonnet" || s === "sonnet-4.5" || s === "sonnet_4_5" || s === "claude-sonnet-4.5") return DEFAULT;
  return v;
}

async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model = resolveClaudeModel();
  const timeoutMs = 180_000; // 3 minutes for page generation

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 8000,
        temperature: typeof args.temperature === "number" ? args.temperature : 0.7,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
    });
  } catch (e: any) {
    if (e?.name === "AbortError" || /aborted|abort/i.test(String(e?.message ?? ""))) {
      throw new Error(`Claude API timeout après ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API erreur (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  return parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

// ---------- Types ----------

const InputSchema = z.object({
  pageType: z.enum(["capture", "sales", "showcase"]),
  // Optional: user can specify a template, otherwise Tipote picks the best one
  templateId: z.string().optional(),
  // Optional: create page from an existing event (webinar/challenge)
  eventId: z.string().uuid().optional(),
  // User's offer info (optional - will use profile data if not provided)
  offerName: z.string().optional(),
  offerPromise: z.string().optional(),
  offerTarget: z.string().optional(),
  offerPrice: z.string().optional(),
  offerPricing: z.array(z.object({
    label: z.string(),
    price: z.string(),
    period: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  offerDescription: z.string().optional(),
  // New fields from "from scratch" flow
  offerGuarantees: z.string().optional(),
  offerUrgency: z.string().optional(),
  offerBenefits: z.string().optional(),
  // Bonuses provided by user — if empty/absent, AI must NOT invent bonuses
  offerBonuses: z.string().optional(),
  // Payment / CTA
  paymentUrl: z.string().optional(),
  paymentButtonText: z.string().optional(),
  // Custom theme/brief
  theme: z.string().optional(),
  // Video embed
  videoEmbedUrl: z.string().optional(),
  // Language (defaults to user's content_locale from profile)
  locale: z.string().optional(),
  // Logo handling for from-scratch creation
  skipBrandLogo: z.boolean().optional(),
  customLogoUrl: z.string().optional(),
  logoText: z.string().optional(),
});

// Template system removed — pages are now built programmatically via lib/pageBuilder.ts

// ---------- Slug generation ----------

function generateSlug(title: string): string {
  const base = (title || "ma-page")
    .replace(/<[^>]*>/g, " ")      // Strip HTML tags (e.g. <br>, <span>)
    .replace(/&[a-z]+;/gi, " ")    // Strip HTML entities
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

/** SSE comment keepalive — keeps the connection alive without triggering client events */
function sseKeepAlive(): string {
  return `: keepalive\n\n`;
}

/** Small delay so the user sees each step animate before it completes */
function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run an async task while sending SSE keepalive comments every `intervalMs`
 * AND sub-progress updates so the user sees activity during the long AI call.
 */
async function withKeepAliveAndProgress<T>(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  sendFn: (event: string, data: any) => void,
  stepId: string,
  stepLabel: string,
  task: () => Promise<T>,
  intervalMs = 12_000,
): Promise<T> {
  let subProgress = 47;
  const timer = setInterval(() => {
    try { controller.enqueue(encoder.encode(sseKeepAlive())); } catch { /* stream closed */ }
    // Slowly increment progress so the UI shows activity (caps at 58 before done=true at 60)
    if (subProgress < 58) {
      subProgress += 2;
      sendFn("step", { id: stepId, label: stepLabel, progress: subProgress });
    }
  }, intervalMs);
  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
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

  // Check credits: 5 for capture, 6 for sales/showcase
  const creditCost = input.pageType === "capture" ? 5 : 6;
  const balance = await ensureUserCredits(userId);
  if (balance.total_remaining < creditCost) {
    return new Response(JSON.stringify({ error: `Crédits insuffisants (${creditCost} crédits requis).`, code: "NO_CREDITS", upgrade_url: "/settings?tab=billing" }), { status: 402, headers: { "content-type": "application/json" } });
  }

  const claudeApiKey = getClaudeApiKey();
  if (!claudeApiKey) {
    return new Response(JSON.stringify({ error: "Clé Claude non configurée." }), { status: 500, headers: { "content-type": "application/json" } });
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
        const lastName = (profile as any)?.last_name || "";
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
        const country = (profile as any)?.country || "France";
        const mission = (profile as any)?.mission || "";
        const brandName = (profile as any)?.brand_name || (profile as any)?.business_name || "";
        const websiteUrl = (profile as any)?.website_url || (profile as any)?.site_url || "";
        const contactEmail = (profile as any)?.contact_email || (profile as any)?.email || session.user.email || "";
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

        // Fetch user's testimonials for injection
        let userTestimonials: any[] = [];
        try {
          const { data: testimonials } = await supabaseAdmin
            .from("testimonials")
            .select("author_name, author_role, content, rating")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10);
          userTestimonials = testimonials || [];
        } catch { /* fail-open */ }

        // If creating from an event, load event data and enrich input
        if (input.eventId) {
          try {
            const { data: ev } = await supabaseAdmin
              .from("webinars")
              .select("*")
              .eq("id", input.eventId)
              .eq("user_id", userId)
              .maybeSingle();
            if (ev) {
              if (!input.offerName && ev.title) input.offerName = ev.title;
              if (!input.offerDescription && ev.description) input.offerDescription = ev.description;
              if (!input.offerUrgency && ev.webinar_date) {
                const d = new Date(ev.webinar_date);
                const fmtDate = (dt: Date) => dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
                input.offerUrgency = ev.event_type === "challenge" && ev.end_date
                  ? `Du ${fmtDate(d)} au ${fmtDate(new Date(ev.end_date))}`
                  : fmtDate(d);
              }
              if (!input.offerPromise && ev.offer_name) input.offerPromise = ev.offer_name;
            }
          } catch { /* fail-open */ }
        }

        await wait(600);
        send("step", { id: "profile", label: "J'analyse ton profil et ton activité...", progress: 10, done: true });

        // ==================== STEP 2: Prepare design system ====================
        send("step", { id: "template", label: "Je prépare ton design personnalisé...", progress: 15 });

        const templateKind = input.pageType === "sales" ? "vente" : input.pageType === "showcase" ? "vitrine" : "capture";
        const templateId = "tipote-builder"; // No more template files — pages are built programmatically

        await wait(400);
        send("step", { id: "template", label: "Je prépare ton design personnalisé...", progress: 20, done: true });

        // ==================== STEP 3: Prepare universal schema ====================
        send("step", { id: "schema", label: "Je prépare la structure de ta page...", progress: 25 });

        // Universal schema: same for ALL templates — content is niche-agnostic
        const schemaPrompt = universalSchemaToPrompt(input.pageType);

        await wait(700);
        send("step", { id: "schema", label: "Je prépare la structure de ta page...", progress: 30, done: true });

        // ==================== STEP 4: Load copywriting knowledge ====================
        const knowledgeLabel = input.pageType === "sales" ? "Je m'inspire des meilleures pages de vente..." : input.pageType === "showcase" ? "Je m'inspire des meilleurs sites vitrines..." : "Je m'inspire des meilleures pages de capture...";
        send("step", { id: "knowledge", label: knowledgeLabel, progress: 35 });

        // Static knowledge: always injected (proven copywriting frameworks)
        const copywritingKnowledge = buildCopywritingKnowledge(input.pageType);

        // Also search vector DB for additional context
        let knowledgeSnippets: string[] = [];
        try {
          const query = `${input.pageType === "sales" ? "page de vente" : "page de capture"} ${niche} ${input.offerName || ""} conversion copywriting`;
          const chunks = await searchResourceChunks({ query, matchCount: 5, matchThreshold: 0.45 });
          knowledgeSnippets = chunks.map((c) => c.content);
        } catch { /* fail-open */ }

        await wait(500);
        send("step", { id: "knowledge", label: knowledgeLabel, progress: 40, done: true });

        // ==================== STEP 5: Generate copywriting ====================
        send("step", { id: "copy", label: input.pageType === "sales" ? "Je rédige ton texte de vente..." : input.pageType === "showcase" ? "Je rédige le contenu de ton site vitrine..." : "Je rédige ton texte de capture...", progress: 45 });

        // Build niche-specific recommendations
        const nichePrompt = buildNichePrompt(niche, input.offerDescription || input.offerName || "");

        // Build the AI prompt
        const systemPrompt = buildPageSystemPrompt({
          pageType: input.pageType,
          schemaPrompt,
          niche,
          toneOfVoice,
          copywritingKnowledge,
          knowledgeSnippets,
          nicheRecommendations: nichePrompt,
          language: contentLocale,
          brandFont,
          brandColorBase,
          brandColorAccent,
          authorName: fullName || firstName,
        });

        const userPrompt = buildPageUserPrompt({
          pageType: input.pageType,
          offerName: input.offerName || "",
          offerPromise: input.offerPromise || "",
          offerTarget: input.offerTarget || "",
          offerPrice: input.offerPrice || "",
          offerPricing: input.offerPricing || null,
          offerDescription: input.offerDescription || "",
          offerGuarantees: input.offerGuarantees || "",
          offerUrgency: input.offerUrgency || "",
          offerBenefits: input.offerBenefits || "",
          offerBonuses: input.offerBonuses || "",
          theme: input.theme || "",
          firstName: fullName || firstName,
          niche,
          mission,
          profile,
          paymentUrl: input.paymentUrl || "",
          paymentButtonText: input.paymentButtonText || "",
          testimonials: userTestimonials,
        });

        const copyLabel = input.pageType === "sales" ? "Je rédige ton texte de vente..." : input.pageType === "showcase" ? "Je rédige le contenu de ton site vitrine..." : "Je rédige ton texte de capture...";

        // Wrap the long-running Claude call with SSE keepalive heartbeats + sub-progress
        // to prevent Cloudflare/Vercel/QUIC from dropping the idle connection
        // and to show the user that work is happening during the long AI call.
        const raw = await withKeepAliveAndProgress(
          controller, encoder, send,
          "copy", copyLabel,
          () => callClaude({
            apiKey: claudeApiKey,
            system: systemPrompt,
            user: userPrompt,
            maxTokens: 8000,
            temperature: 0.7,
          }),
        );

        send("step", { id: "copy", label: input.pageType === "sales" ? "Je rédige ton texte de vente..." : input.pageType === "showcase" ? "Je rédige le contenu de ton site vitrine..." : "Je rédige ton texte de capture...", progress: 60, done: true });

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

        // ---- Post-generation cleanup: strip placeholder patterns ----
        sanitizeContentData(contentData, input);

        // Inject user-provided data (overrides AI-generated placeholders)
        if (input.offerName) contentData.offer_name = input.offerName;
        // Logo handling: if user explicitly skipped logo, don't inject brand logo
        if (input.skipBrandLogo) {
          contentData.logo_image_url = ""; // No logo image
          if (input.logoText) contentData.logo_text = input.logoText;
        } else if (input.customLogoUrl) {
          contentData.logo_image_url = input.customLogoUrl;
        } else if (brandLogoUrl && !contentData.logo_image_url) {
          contentData.logo_image_url = brandLogoUrl;
        }
        // Inject author photo into ALL possible photo field names
        if (brandAuthorPhoto) {
          const photoFields = ["author_photo_url", "about_img_url", "trainer_img_url", "speaker_photo_url", "expert_photo_url", "coach_photo_url", "profile_photo_url", "hero_img_url"];
          for (const field of photoFields) {
            if (!contentData[field]) contentData[field] = brandAuthorPhoto;
          }
        }
        if (input.videoEmbedUrl) contentData.video_embed_url = input.videoEmbedUrl;

        // Inject full name into about_name (replace "Nom Prénom" placeholder)
        const authorName = fullName || firstName || "";
        if (authorName) {
          if (!contentData.about_name || /^Nom\s*(et\s*)?Pr[eé]nom$/i.test(contentData.about_name) || contentData.about_name === "Nom Prénom") {
            contentData.about_name = authorName;
          }
        }

        // Inject contact email (replace "contact@votresite.com" placeholder)
        if (contactEmail) {
          if (!contentData.contact_email || /votresite|yoursite|example\.com/i.test(contentData.contact_email)) {
            contentData.contact_email = contactEmail;
          }
        }

        // Inject brand name into logo_text if the AI left it generic
        const offerOrBrand = brandName || input.offerName || niche || fullName || "";
        if (offerOrBrand && (!contentData.logo_text || /votre|your|logo/i.test(contentData.logo_text))) {
          contentData.logo_text = offerOrBrand.toUpperCase().slice(0, 25);
        }
        // Also set footer_logo from brand
        if (offerOrBrand && (!contentData.footer_logo || /votre|your|logo/i.test(contentData.footer_logo))) {
          contentData.footer_logo = offerOrBrand.toUpperCase().slice(0, 40);
        }

        // Inject logo_subtitle from brand tagline if available
        const brandTagline = (profile as any)?.brand_tagline || (profile as any)?.tagline || (profile as any)?.slogan || "";
        if (brandTagline && (!contentData.logo_subtitle || /baseline|votre/i.test(contentData.logo_subtitle))) {
          contentData.logo_subtitle = brandTagline.slice(0, 30);
        }

        // Replace any remaining "votresite.com" or placeholder URLs in all string fields
        for (const key of Object.keys(contentData)) {
          if (typeof contentData[key] === "string") {
            if (/votresite\.com|yoursite\.com|example\.com/i.test(contentData[key])) {
              const replacement = websiteUrl || (contactEmail ? contactEmail.split("@")[1] || "" : "");
              contentData[key] = contentData[key].replace(/(?:contact@)?(?:votresite|yoursite|example)\.com/gi, replacement || contactEmail || "");
            }
          }
        }

        // Inject payment URL into all CTA-related fields
        const payUrl = input.paymentUrl || "";
        if (payUrl) {
          if (!contentData.cta_url) contentData.cta_url = payUrl;
          if (!contentData.cta_primary_url) contentData.cta_primary_url = payUrl;
          if (!contentData.payment_url) contentData.payment_url = payUrl;
        }

        // Strip bonus sections if user didn't provide bonuses (prevent AI inventions)
        const hasBonuses = !!(input.offerBonuses || "").trim();
        if (!hasBonuses) {
          const bonusKeys = Object.keys(contentData).filter(k =>
            /^bonus/i.test(k) || k === "bonuses"
          );
          for (const k of bonusKeys) {
            contentData[k] = Array.isArray(contentData[k]) ? [] : "";
          }
        }

        // Strip countdown/urgency sections if user didn't provide urgency
        const hasUrgency = !!(input.offerUrgency || "").trim();
        if (!hasUrgency) {
          const urgencyKeys = Object.keys(contentData).filter(k =>
            /countdown|counter|timer/i.test(k)
          );
          for (const k of urgencyKeys) {
            contentData[k] = Array.isArray(contentData[k]) ? [] : "";
          }
        }

        await wait(400);
        send("step", { id: "design", label: "Je crée ton design personnalisé...", progress: 75, done: true });

        // ==================== STEP 7: Apply branding ====================
        send("step", { id: "branding", label: "J'applique ton identité visuelle...", progress: 78 });

        const brandTokens: Record<string, any> = {};
        if (brandColorBase) brandTokens["colors-primary"] = brandColorBase;
        if (brandColorAccent) brandTokens["colors-accent"] = brandColorAccent;
        if (brandFont) brandTokens["typography-heading"] = brandFont;

        await wait(400);
        send("step", { id: "branding", label: "J'applique ton identité visuelle...", progress: 82, done: true });

        // ==================== STEP 8: Add legal compliance ====================
        send("step", { id: "legal", label: "J'ajoute tes mentions légales...", progress: 85 });

        if (cgvUrl && !contentData.legal_cgv_url) contentData.legal_cgv_url = cgvUrl;
        if (privacyUrl && !contentData.legal_privacy_url) contentData.legal_privacy_url = privacyUrl;
        if (termsUrl && !contentData.legal_mentions_url) contentData.legal_mentions_url = termsUrl;

        // Build footer_links array with actual legal URLs for templates that use it
        const footerLinks: Array<{ text: string; href: string }> = [];
        if (termsUrl) footerLinks.push({ text: "Mentions Légales", href: termsUrl });
        if (cgvUrl) footerLinks.push({ text: "Conditions générales de vente", href: cgvUrl });
        if (privacyUrl) footerLinks.push({ text: "Politique de confidentialité", href: privacyUrl });
        if (footerLinks.length > 0 && !contentData.footer_links) {
          contentData.footer_links = footerLinks;
        }

        await wait(300);
        send("step", { id: "legal", label: "J'ajoute tes mentions légales...", progress: 88, done: true });

        // ==================== STEP 9: Build page with programmatic page builder ====================
        send("step", { id: "render", label: "J'optimise ta page pour les téléphones...", progress: 90 });

        // Build full HTML page using the programmatic page builder
        let renderedHtml = buildPage({
          pageType: input.pageType,
          contentData,
          brandTokens: Object.keys(brandTokens).length > 0 ? brandTokens : null,
          locale: contentLocale,
        });

        send("step", { id: "render", label: "J'optimise ta page pour les téléphones...", progress: 93, done: true });

        // ==================== STEP 10: Save to database ====================
        send("step", { id: "save", label: input.paymentUrl ? "Je mets en place ton lien de paiement..." : "Je sauvegarde ta page...", progress: 95 });

        // Strip HTML tags from title for clean slug/display
        const rawTitle = contentData.hero_title || contentData.headline || contentData.main_headline || "Ma page";
        const title = rawTitle.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
          locale: contentLocale,
          video_embed_url: input.videoEmbedUrl || "",
          payment_url: input.paymentUrl || "",
          payment_button_text: input.paymentButtonText || "",
          meta_title: String(title).slice(0, 60),
          meta_description: (contentData.hero_subtitle || contentData.hero_description || "").slice(0, 160),
          legal_mentions_url: termsUrl,
          legal_cgv_url: cgvUrl,
          legal_privacy_url: privacyUrl,
          // Thank-you page content (capture pages)
          ...(input.pageType === "capture" ? {
            thank_you_title: (contentData.thank_you_title || "Merci pour ton inscription !").slice(0, 200),
            thank_you_message: (contentData.thank_you_message || "Tu vas recevoir tes accès par email dans les prochaines minutes. Pense à vérifier tes spams !").slice(0, 500),
            thank_you_cta_text: (contentData.thank_you_cta_text || "").slice(0, 100),
            thank_you_cta_url: input.paymentUrl || "",
          } : {}),
        };

        const { data: page, error: insertError } = await supabaseAdmin
          .from("hosted_pages")
          .insert(pageRow)
          .select("id, slug")
          .single();

        if (insertError || !page) {
          throw new Error(insertError?.message || "Erreur lors de la sauvegarde.");
        }

        // Consume credits: 5 for capture, 6 for sales
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
  pageType: "capture" | "sales" | "showcase";
  schemaPrompt: string;
  niche: string;
  toneOfVoice: string;
  copywritingKnowledge: string;
  knowledgeSnippets: string[];
  nicheRecommendations?: string;
  language?: string;
  brandFont?: string;
  brandColorBase?: string;
  brandColorAccent?: string;
  authorName?: string;
}): string {
  const lines: string[] = [];

  lines.push("Tu es Tipote, un copywriter direct-response expert de niveau mondial.");
  lines.push("Tu crées des pages web qui CONVERTISSENT, pas des pages génériques.");
  lines.push("Tu rédiges du contenu FINAL prêt à publier, comme si un client payait 5000 € pour cette page.");
  lines.push("");

  if (params.pageType === "capture") {
    lines.push("OBJECTIF : Créer une page de capture irrésistible qui pousse le visiteur à laisser son email.");
    lines.push("Structure persuasive OBLIGATOIRE :");
    lines.push("1. HOOK : Accroche choc qui capte l'attention en 1 seconde");
    lines.push("2. HEADLINE : Promesse de valeur irrésistible, spécifique, orientée résultat");
    lines.push("3. SOUS-TITRE : Précise le mécanisme, le public cible, élimine la première objection");
    lines.push("4. PARAGRAPHE HERO : 1-3 phrases qui développent la promesse avec empathie et spécificité");
    lines.push("5. PUCES PROMESSES : 3-5 bénéfices concrets + conséquence positive (le coeur de la conversion)");
    lines.push("6. PROGRAMME/CONTENU : Ce que contient l'offre gratuite (si pertinent)");
    lines.push("7. PREUVE SOCIALE + AUTEUR : Bio storytelling crédible de l'auteur");
    lines.push("8. CTA : Bouton orienté résultat + réassurance");
    lines.push("");
    lines.push("RÈGLE CLÉ : Le texte doit être RICHE et COMPLET. Une page de capture qui convertit a BEAUCOUP de contenu persuasif, pas juste un titre et un bouton.");
    lines.push("CHAQUE champ requis doit contenir du VRAI copywriting, pas du texte générique ou placeholder.");
    lines.push("");
    lines.push("VISUEL HERO (illustration dans la section au-dessus de la ligne de flottaison) :");
    lines.push("Tu dois remplir les champs hero_visual_* pour générer une illustration moderne à côté du texte.");
    lines.push("CHOISIS le hero_visual_type selon l'offre :");
    lines.push("- SaaS/outil/app → 'saas_dashboard' (mockup type dashboard avec sidebar, progress bar, tâches)");
    lines.push("- Ebook/guide/PDF → 'ebook_cover' (mockup de couverture avec chapitres, badge gratuit)");
    lines.push("- Coaching/call → 'video_call' (mockup d'interface vidéo avec avatar, boutons)");
    lines.push("- Checklist/template/workbook → 'checklist' (mockup de liste avec items cochés)");
    lines.push("- Challenge/programme → 'calendar' (mockup calendrier avec jours et progression)");
    lines.push("- Formation/certification → 'certificate' (mockup diplôme/certificat)");
    lines.push("- Chatbot/IA/assistant → 'chat_interface' (mockup de conversation chat)");
    lines.push("Les hero_visual_items sont les éléments affichés dans le mockup (menu, chapitres, features).");
    lines.push("Les hero_visual_metrics sont 2-3 cartes flottantes avec une stat/résultat impressionnant.");
  } else if (params.pageType === "showcase") {
    lines.push("OBJECTIF : Créer un site vitrine professionnel, moderne et orienté action.");
    lines.push("Le site vitrine est une ONE-PAGE qui présente l'activité, les services et redirige vers un lien (RDV, formulaire, essai gratuit, page de vente).");
    lines.push("");
    lines.push("CARACTÉRISTIQUES D'UN BON SITE VITRINE :");
    lines.push("- Design moderne, professionnel, cohérent avec la marque");
    lines.push("- Navigation intuitive : tout sur une seule page avec des ancres vers chaque section");
    lines.push("- Contenu clair, concis et orienté client : proposition de valeur en quelques secondes");
    lines.push("- CTA bien placés : 'Prendre rendez-vous', 'Essayer gratuitement', 'Demander un devis', 'Nous contacter'");
    lines.push("- Éléments de confiance : témoignages, chiffres clés, certifications");
    lines.push("- Section contact claire avec toutes les coordonnées");
    lines.push("");
    lines.push("Structure OBLIGATOIRE :");
    lines.push("1. NAV : Navigation sticky avec logo + ancres vers les sections + CTA");
    lines.push("2. HERO : Proposition de valeur + sous-titre + CTA principal + CTA secondaire (optionnel)");
    lines.push("3. SERVICES : Grille de 3-6 services/fonctionnalités avec icône + titre + description");
    lines.push("4. CHIFFRES CLÉS : 3-4 statistiques qui crédibilisent (si données disponibles)");
    lines.push("5. AVANTAGES : Pourquoi choisir cette entreprise");
    lines.push("6. PROCESSUS : Comment ça marche (3-5 étapes)");
    lines.push("7. À PROPOS : Bio du fondateur/expert");
    lines.push("8. TÉMOIGNAGES : Avis clients (si disponibles)");
    lines.push("9. TARIFS : Grille tarifaire (si prix publics)");
    lines.push("10. FAQ : Questions fréquentes");
    lines.push("11. CONTACT : Coordonnées + CTA de contact");
    lines.push("");
    lines.push("RÈGLE CLÉ : Le ton est professionnel mais accessible. Pas de jargon marketing agressif.");
    lines.push("Le visiteur doit comprendre EN 5 SECONDES ce que fait l'entreprise et comment la contacter.");
  } else {
    lines.push("OBJECTIF : Créer une page de vente qui VEND. Chaque mot doit rapprocher le prospect de l'achat.");
    lines.push("Structure : Hook → Problème → Agitation → Solution → Mécanisme → Preuves → Offre → Objections → Urgence → Garantie → CTA");
  }
  lines.push("");

  // ---- BLAIR WARREN ONE SENTENCE PERSUASION FRAMEWORK ----
  lines.push("CADRE DE PERSUASION (Blair Warren — fil conducteur du copywriting) :");
  lines.push("Le contenu doit naturellement intégrer ces 5 leviers psychologiques :");
  lines.push("1. ENCOURAGER LES RÊVES : Montre au prospect que son rêve est atteignable grâce à cette offre.");
  lines.push("2. JUSTIFIER LES ÉCHECS : Explique pourquoi ses tentatives passées n'ont pas fonctionné.");
  lines.push("3. APAISER LES PEURS : Anticipe ses doutes et rassure concrètement.");
  lines.push("4. CONFIRMER LES SOUPÇONS : Valide ce qu'il soupçonne déjà.");
  lines.push("5. TROUVER UN ENNEMI COMMUN : Identifie un obstacle externe pour se placer du côté du prospect.");
  lines.push("");

  // ---- 5 CRITÈRES DE CONTENU ----
  lines.push("5 CRITÈRES OBLIGATOIRES (chaque texte doit cocher les 5) :");
  lines.push("- UTILE : Bénéfice concret et immédiat.");
  lines.push("- SPÉCIFIQUE : Stratégie, outil, méthode précise — jamais de vague.");
  lines.push("- CIBLÉ : UNE audience, SES mots, SES problèmes, SES rêves.");
  lines.push("- APPLICABLE : Action concrète pour le lecteur.");
  lines.push("- UNIQUE : Personnalité de l'auteur, pas un contenu interchangeable.");
  lines.push("");

  lines.push("RÈGLES DE COPYWRITING :");
  lines.push("- Parle directement au prospect (tu/vous selon le ton)");
  lines.push("- Chaque titre = curiosité ou urgence ou idée controversée ou chiffre choc non inventé");
  lines.push("- Inspire-toi de formules copywriting éprouvées comme AIDA, PAS, PASTOR, BEFORE AFTER BRIDGE, ... sans jamais les citer");
  lines.push("- Bénéfices avant caractéristiques, TOUJOURS");
  lines.push("- Chiffres concrets (3 étapes, 7 jours, etc.)");
  lines.push("- CTA orienté résultat (\"Je transforme mon business\" pas \"Cliquer ici\")");
  lines.push("- Evite les tournures et expressions fréquemment utilisés par les IA génératives");
  lines.push("- Vocabulaire adapté à la niche et au public");
  lines.push("- JAMAIS de phrases vides (\"bienvenue\", \"nous sommes ravis\")");
  lines.push("- Alterner phrases percutantes, courtes (5 mots) et moyennes (15 mots) pour créer du rythme");
  lines.push("- Utiliser la voix active (pas passive)");
  lines.push("- Te concentrer sur des conseils pratiques et actionnables");
  lines.push("- Utiliser des données et exemples concrets");
  lines.push("- Favorise la bonne compréhension du lecteur, guide le naturellement de section en section");
  lines.push("");

  lines.push("INTERDICTIONS ABSOLUES :");
  lines.push("- ZÉRO balise HTML (<br>, <span>, <strong>, etc.) — texte brut uniquement.");
  lines.push("- ZÉRO markdown (**, ##, -, >, etc.).");
  lines.push("- ZÉRO placeholder/instruction (\"Décris ici...\", \"Puce promesse\", \"[Nom]\").");
  lines.push("- ZÉRO contenu inventé : pas de bonus, garanties, témoignages, prix, places non fournis.");
  lines.push("- ZÉRO emoji SAUF dans hero_visual_metrics[].icon (1 emoji par carte flottante).");
  lines.push("- ZÉRO lorem ipsum.");
  lines.push("- ZÉRO mention de Tipote, d'IA, de coach IA, d'assistant IA, de chatbot Tipote, ou de toute technologie IA dans le contenu. La page est celle de L'UTILISATEUR, pour SES visiteurs. L'IA est invisible.");
  lines.push("- Utilise le NOM EXACT de l'offre fourni par l'utilisateur.");
  lines.push("- FAQ : question ET réponse complète (2-3 phrases). JAMAIS de question sans réponse.");
  lines.push("- Puces promesses : VRAIE phrase complète, PAS une instruction de rédaction.");
  lines.push("- Interdit d'utiliser de tirets longs (—).");
  lines.push("- Interdit d'utiliser de métaphores ou clichés");
  lines.push("- Interdit de faire de généralisations vagues");
  lines.push("- Interdit d'ytiliser de tournures impersonnelles (Il convient de…, Il est recommandé de…, Cela permet de…)");
  lines.push("- Interdit d'ajouter d'avertissements ou de notes non demandés");
  lines.push("- Interdit d'utiliser d'adjectifs ou adverbes inutiles");
  lines.push("- Interdit d'écrire de phrases hachées ou saccadées");
  lines.push("");

  // ---- KNOWLEDGE ----
  lines.push(params.copywritingKnowledge);
  lines.push("");

  if (params.knowledgeSnippets.length > 0) {
    lines.push("RESSOURCES ADDITIONNELLES (extraits de la base de connaissances) :");
    params.knowledgeSnippets.forEach((s, i) => {
      lines.push(`\n--- Ressource ${i + 1} ---`);
      lines.push(s.slice(0, 1500));
    });
    lines.push("");
  }

  // ---- NICHE-SPECIFIC RECOMMENDATIONS ----
  if (params.nicheRecommendations) {
    lines.push(params.nicheRecommendations);
    lines.push("");
  }

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

  // ---- LANGUAGE & LOCALE ----
  const LOCALE_LABELS: Record<string, string> = {
    fr: "français", en: "English", es: "español", it: "italiano",
    pt: "português", de: "Deutsch", nl: "Nederlands", ar: "العربية",
    tr: "Türkçe", pl: "polski", ro: "română", ja: "日本語", zh: "中文",
    ko: "한국어", ru: "русский", hi: "हिन्दी",
  };
  const lang = params.language || "fr";
  const langLabel = LOCALE_LABELS[lang] ?? lang;

  lines.push("═══ LANGUE & LOCALISATION ═══");
  lines.push(`LANGUE OBLIGATOIRE : ${langLabel}. TOUT le contenu du JSON DOIT être rédigé en ${langLabel}.`);
  lines.push("");

  // Comprehensive locale-specific copywriting guidance
  const LOCALE_COPYWRITING: Record<string, string[]> = {
    fr: [
      "Conventions : prix \"497 €\" (espace avant €), virgule pour décimaux (19,90 €).",
      "Accents corrects obligatoires (é, è, ê, à, ù, ç, î, ô).",
      "Tutoiement par défaut sauf si le ton de voix indique le vouvoiement.",
      "Style : direct, percutant, conversationnel. Évite le jargon corporate.",
      "CTA en français naturel : \"Je m'inscris\", \"Je télécharge\", \"J'en profite\".",
    ],
    en: [
      "Prices: \"$497\" or \"£497\" (symbol before number), period for decimals ($19.90).",
      "Use 'you' — direct, conversational, confident tone.",
      "CTA style: action-oriented (\"Get instant access\", \"Start my transformation\").",
      "Copywriting should feel American direct-response — punchy, benefit-driven.",
      "Use power words: discover, unlock, transform, proven, exclusive, instant.",
    ],
    es: [
      "Precios: \"497 €\" o \"$497\" según el mercado (España vs Latam).",
      "Coma para decimales (19,90 €).",
      "Tuteo por defecto, ustedeo si el tono lo pide.",
      "CTA: \"Accede ahora\", \"Descarga tu guía\", \"Quiero empezar\".",
      "Copywriting: directo, emocional, cercano. Evitar anglicismos innecesarios.",
    ],
    de: [
      "Preise: \"497 €\" (Symbol nach Zahl), Komma für Dezimalstellen (19,90 €).",
      "Siezen (Sie) ist Standard, Duzen (du) nur bei informellem Ton.",
      "CTA: \"Jetzt starten\", \"Kostenlos herunterladen\", \"Zugang sichern\".",
      "Deutsch soll professionell, klar und direkt klingen — nicht zu werblich.",
    ],
    it: [
      "Prezzi: \"497 €\", virgola per i decimali (19,90 €).",
      "Dare del tu o del Lei secondo il tono del brand.",
      "CTA: \"Inizia ora\", \"Scarica la guida\", \"Accedi subito\".",
      "Copywriting: diretto, persuasivo, con un tocco personale.",
    ],
    pt: [
      "Preços: \"497 €\" (Portugal) ou \"R$ 497\" (Brasil), vírgula para decimais.",
      "Tratar por tu/você (BR) ou tu (PT) conforme o tom.",
      "CTA: \"Comece agora\", \"Baixe seu guia\", \"Quero participar\".",
      "Copywriting: direto, envolvente, com storytelling emocional.",
    ],
    nl: [
      "Prijzen: \"€ 497\" (symbool voor getal), komma voor decimalen (€ 19,90).",
      "Gebruik 'je/jij' tenzij formeel toon.",
      "CTA: \"Start nu\", \"Download je gids\", \"Schrijf je in\".",
    ],
    ar: [
      "الأسعار: \"497 €\" أو حسب السوق المستهدف.",
      "الكتابة من اليمين إلى اليسار.",
      "CTA: \"ابدأ الآن\"، \"حمّل الدليل\"، \"سجّل مجاناً\".",
      "أسلوب مباشر وحماسي، مع احترام الثقافة المحلية.",
    ],
    tr: [
      "Fiyatlar: \"497 €\" veya \"497 TL\", virgül ile ondalık (19,90 €).",
      "Sen/siz kullanımı marka tonuna göre.",
      "CTA: \"Hemen başla\", \"Rehberini indir\", \"Şimdi katıl\".",
    ],
  };

  const localeRules = LOCALE_COPYWRITING[lang];
  if (localeRules) {
    localeRules.forEach((r) => lines.push(`- ${r}`));
  } else {
    lines.push(`- Rédige TOUT le contenu en ${langLabel}.`);
    lines.push("- Adapte les conventions de prix, ponctuation et formules de politesse à cette langue.");
    lines.push("- Les CTA doivent être dans cette langue, naturels et orientés action.");
  }
  lines.push("");

  // Multi-language copywriting quality instruction
  lines.push("QUALITÉ MULTILINGUE :");
  lines.push("- Le copywriting doit être AUSSI BON que si un copywriter natif l'avait écrit.");
  lines.push("- Utilise les expressions idiomatiques naturelles de cette langue.");
  lines.push("- Adapte les références culturelles au marché cible (pas de francismes en anglais, etc.).");
  lines.push("- Les jeux de mots, accroches et formules doivent fonctionner DANS cette langue, pas être traduits.");
  lines.push("");

  lines.push("CONTRAINTE DE SORTIE :");
  lines.push("- Retourne UNIQUEMENT un objet JSON valide.");
  lines.push("- Pas de markdown, pas de commentaire, pas de texte autour.");
  lines.push("- Respecte STRICTEMENT le schéma ci-dessous.");
  lines.push("");

  lines.push("TARIFICATION MULTI-PALIERS (si applicable) :");
  lines.push("- Si le brief de l'utilisateur contient plusieurs paliers de prix, ajoute un champ \"pricing_tiers\" dans le JSON.");
  lines.push("- Format: \"pricing_tiers\": [{\"label\": \"Nom du palier\", \"price\": \"97€\", \"period\": \"/mois\", \"description\": \"Ce qui est inclus\", \"features\": [\"Feature 1\", \"Feature 2\"]}]");
  lines.push("- Chaque palier doit avoir au minimum: label + price. Les champs period, description et features sont optionnels.");
  lines.push("- Si l'offre a un seul prix, n'ajoute PAS de pricing_tiers — utilise price_amount comme d'habitude.");
  lines.push("");

  lines.push(params.schemaPrompt);

  return lines.join("\n");
}

function buildPageUserPrompt(params: {
  pageType: "capture" | "sales" | "showcase";
  offerName: string;
  offerPromise: string;
  offerTarget: string;
  offerPrice: string;
  offerPricing?: Array<{ label: string; price: string; period?: string; description?: string }> | null;
  offerDescription: string;
  offerGuarantees: string;
  offerUrgency: string;
  offerBenefits: string;
  offerBonuses: string;
  theme: string;
  firstName: string;
  niche: string;
  mission: string;
  profile: any;
  paymentUrl: string;
  paymentButtonText: string;
  testimonials?: any[];
}): string {
  const lines: string[] = [];

  const pageLabel = params.pageType === "sales" ? "page de vente" : params.pageType === "showcase" ? "site vitrine (one-page)" : "page de capture";
  lines.push(`Crée une ${pageLabel} pour :`);
  lines.push("");

  if (params.offerName) lines.push(`Offre : ${params.offerName}`);
  if (params.offerPromise) lines.push(`Promesse principale : ${params.offerPromise}`);
  if (params.offerTarget) lines.push(`Public cible : ${params.offerTarget}`);
  if (params.offerPrice) lines.push(`Prix : ${params.offerPrice}`);
  if (params.offerPricing && params.offerPricing.length > 0) {
    lines.push("Paliers de prix (IMPORTANT — utilise le champ pricing_tiers dans le JSON de sortie) :");
    params.offerPricing.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${t.label || "Palier"} : ${t.price}${t.period ? ` (${t.period})` : ""}${t.description ? ` — ${t.description}` : ""}`);
    });
  }
  if (params.offerDescription) lines.push(`Description : ${params.offerDescription}`);
  if (params.offerBenefits) lines.push(`Bénéfices concrets :\n${params.offerBenefits}`);
  if (params.offerGuarantees) lines.push(`Garanties : ${params.offerGuarantees}`);
  if (params.offerUrgency) lines.push(`Urgence / Rareté : ${params.offerUrgency}`);
  if (params.offerBonuses) lines.push(`Bonus inclus dans l'offre :\n${params.offerBonuses}`);
  if (params.theme) lines.push(`Brief/Thème : ${params.theme}`);
  if (params.firstName) lines.push(`Auteur : ${params.firstName}`);
  if (params.niche) lines.push(`Niche : ${params.niche}`);
  if (params.mission) lines.push(`Mission : ${params.mission}`);
  if (params.paymentUrl) lines.push(`Lien de paiement / CTA URL : ${params.paymentUrl}`);
  if (params.paymentButtonText) lines.push(`Texte du bouton paiement : ${params.paymentButtonText}`);

  // For showcase: inject contact info from profile
  if (params.pageType === "showcase") {
    const p = params.profile as any;
    const contactEmail = p?.contact_email || p?.email || "";
    const phone = p?.phone || p?.contact_phone || "";
    const address = p?.address || p?.contact_address || "";
    const websiteUrl = p?.website_url || p?.site_url || "";
    if (contactEmail) lines.push(`Email de contact : ${contactEmail}`);
    if (phone) lines.push(`Téléphone : ${phone}`);
    if (address) lines.push(`Adresse : ${address}`);
    if (websiteUrl) lines.push(`Site web : ${websiteUrl}`);
    lines.push("");
    lines.push("INSTRUCTIONS VITRINE :");
    lines.push("- Remplis contact_email, contact_phone, contact_address avec les infos ci-dessus (si disponibles).");
    lines.push("- Le contact_cta_url doit pointer vers le lien de paiement/RDV fourni, ou '#sc-contact' par défaut.");
    lines.push("- Les nav_links doivent correspondre aux sections de la page (ils seront ancrés automatiquement).");
    lines.push("- Les chiffres clés (key_numbers) ne doivent PAS être inventés. Laisser un tableau vide si aucune donnée disponible.");
  }

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
      if (Array.isArray(o.pricing) && o.pricing.length > 0) {
        o.pricing.forEach((t: any) => {
          lines.push(`  - ${t.label || "Palier"}: ${t.price}${t.period ? ` (${t.period})` : ""}`);
        });
      }
    });
  }

  lines.push("");
  lines.push("IMPORTANT — RÈGLES DE COPYWRITING :");
  lines.push("- Remplis TOUS les champs du schéma JSON avec du VRAI texte de copywriting professionnel.");
  lines.push("- Le contenu doit être 100% spécifique à CETTE offre et à CE public cible.");
  lines.push("- INTERDIT de recopier les descriptions d'aide du schéma (\"Décris ici\", \"Promesse de ton offre\", \"ton audience cible\", \"Puce promesse irrésistible\", \"bénéfice + conséquence\", etc.).");
  lines.push("- INTERDIT les placeholders (\"[nom]\", \"[bénéfice]\", \"...\") — rédige le contenu FINAL, prêt à publier.");
  lines.push("- INTERDIT les phrases génériques (\"bienvenue\", \"nous sommes ravis\", \"cliquer ici\").");
  lines.push("- INTERDIT les balises HTML (<br>, <span>, <strong>, etc.) — texte brut uniquement.");
  lines.push("- Pour les FAQ : TOUJOURS fournir question ET réponse complète. Jamais de question seule.");
  lines.push("- Si des informations de l'offre manquent (nom, cible, bénéfices), rédige du copywriting adapté à la niche. MAIS ne PAS inventer de fausses informations factuelles.");
  lines.push("- Ne PAS inventer : bonus, prix, garanties, témoignages, noms de personnes, délais, statistiques, résultats chiffrés, certifications, partenariats, logos clients, durées de garantie. Seulement du copywriting (titres, accroches, descriptions, arguments de vente).");
  lines.push("- RÈGLE CRITIQUE : si un champ conditionnel (bonus, garantie, témoignages, urgence) est marqué comme NON FOURNI dans les instructions ci-dessous, tu DOIS mettre des strings/tableaux vides. Ne JAMAIS remplir un champ conditionnel avec du contenu inventé.");
  lines.push("- Chaque titre, sous-titre et CTA doit être spécifique, percutant et orienté bénéfice.");
  lines.push("- Chaque puce/bullet doit être une VRAIE PHRASE COMPLÈTE décrivant un bénéfice concret. JAMAIS écrire \"Puce promesse irrésistible : bénéfice + conséquence\" — c'est une INSTRUCTION, pas du contenu. Exemple correct : \"Génère tes premiers clients en 7 jours grâce au système d'acquisition automatisé\".");
  lines.push("");

  // Conditional: bonuses
  if (params.offerBonuses.trim()) {
    lines.push("BONUS : L'utilisateur a fourni des bonus ci-dessus. Utilise-les tels quels dans les sections bonus. Ne les modifie pas et n'en invente pas d'autres.");
  } else {
    lines.push("BONUS : L'utilisateur N'A PAS de bonus. Pour tous les champs bonus (bonus_section_title, bonuses, bonus_*, etc.), mets des strings vides \"\" ou des tableaux vides []. N'invente AUCUN bonus.");
  }

  // Conditional: testimonials
  if (params.testimonials && params.testimonials.length > 0) {
    lines.push("");
    lines.push("TÉMOIGNAGES RÉELS DE L'UTILISATEUR (utilise-les dans les sections testimonials) :");
    params.testimonials.forEach((t: any, i: number) => {
      lines.push(`${i + 1}. "${t.content}" — ${t.author_name}${t.author_role ? ` (${t.author_role})` : ""}${t.rating ? ` ★${t.rating}/5` : ""}`);
    });
    lines.push("Utilise ces témoignages TELS QUELS. Ne les modifie pas. N'en invente pas d'autres.");
  } else {
    lines.push("TÉMOIGNAGES : L'utilisateur N'A PAS de témoignages. Pour tous les champs testimonials (testimonials, testimonials_title, visual_testimonials, etc.), mets des strings vides \"\" ou des tableaux vides []. N'invente AUCUN témoignage.");
  }

  // Conditional: guarantees
  if (params.offerGuarantees.trim()) {
    lines.push("");
    lines.push(`GARANTIE : L'utilisateur a une garantie : "${params.offerGuarantees}". Utilise-la telle quelle dans les sections garantie. Ne la modifie pas et n'en invente pas d'autres.`);
  } else {
    lines.push("");
    lines.push("GARANTIE : L'utilisateur N'A PAS de garantie. Pour tous les champs guarantee (guarantee_title, guarantee_text, etc.), mets des strings vides \"\". N'invente AUCUNE garantie (pas de \"satisfait ou remboursé\", pas de \"garantie 30 jours\", etc.).");
  }

  // Conditional: urgency/countdown
  if (params.offerUrgency.trim()) {
    lines.push(`URGENCE : L'utilisateur a une urgence : "${params.offerUrgency}". Utilise-la dans les sections countdown/urgence/timing.`);
  } else {
    lines.push("URGENCE : L'utilisateur N'A PAS d'urgence. Pour tous les champs countdown/timer/urgence (countdown_label, timing_*, counter_*, etc.), mets des strings vides \"\". Pas de faux décompte ni de fausse rareté.");
  }

  lines.push("");
  lines.push("- Retourne uniquement le JSON, rien d'autre.");

  return lines.join("\n");
}

// ---------- Content sanitization ----------

/**
 * Strip placeholder patterns, invented content, and template instructions
 * that the AI might have leaked into the generated content.
 */
function sanitizeContentData(data: Record<string, any>, input: any): void {
  // Patterns that indicate placeholder/template text (NOT real content)
  const PLACEHOLDER_PATTERNS = [
    /\[Nom\]/gi,
    /\[Titre\]/gi,
    /\[Bénéfice\]/gi,
    /\[Audience\]/gi,
    /\[Prénom\]/gi,
    /\[Icône\]/gi,
    /\[Photo[^\]]*\]/gi,
    /\[Ta photo[^\]]*\]/gi,
    /\[Image[^\]]*\]/gi,
    /\[Ton nom[^\]]*\]/gi,
    /\[Votre[^\]]*\]/gi,
    /\[Logo[^\]]*\]/gi,
    /\[.*?\]/g, // Any remaining [bracketed text]
    /Lorem ipsum[^.]*/gi,
    /Dolor sit amet/gi,
    /Puce promesse[^.!\n]*/gi,
    /bénéfice \+ conséquence[^.!\n]*/gi,
    /Décris ici[^.!\n]*/gi,
    /Explique (?:ici|ce que|l'option)[^.!\n]*/gi,
    /Promesse de ton offre/gi,
    /Description (?:complète )?d(?:e l'|u )[^.!\n]*/gi,
    /Témoignage sincère d'un client/gi,
    /PUCE PROMESSE/gi,
    /CEO vs Entrepreneur/gi,
    /Exercice du jour \d+/gi,
    /Objectif du challenge/gi,
    /Description de l'exercice/gi,
    /Photo représentat[^.!\n]*/gi,
    /ton audience cible/gi,
  ];

  // Patterns that indicate invented scarcity (when no urgency was provided)
  const hasUrgency = !!(input.offerUrgency || "").trim();
  const SCARCITY_PATTERNS = hasUrgency ? [] : [
    /\d+\s*\/\s*\d+/g, // "14/100"
    /places?\s+restantes?/gi,
    /Il (?:ne )?reste (?:plus que |encore )?\d+/gi,
    /Places? limitées?/gi,
    /Dernières? places?/gi,
  ];

  // Replace offer name placeholder: "Challenge [Nom]" → actual offer name
  const offerName = input.offerName || "";

  function cleanString(val: string): string {
    let s = val;

    // Replace "Challenge [Nom]" or "[Nom] Formation" with actual offer name
    if (offerName) {
      s = s.replace(/Challenge\s+\[Nom\]/gi, offerName);
      s = s.replace(/\[Nom\]\s*/gi, offerName + " ");
    }

    // Strip placeholder patterns
    for (const p of PLACEHOLDER_PATTERNS) {
      s = s.replace(p, "");
    }

    // Strip invented scarcity
    for (const p of SCARCITY_PATTERNS) {
      s = s.replace(p, "");
    }

    // Strip HTML tags — AI sometimes generates <strong>, <em>, <br>, <p> etc.
    s = s.replace(/<[^>]+>/g, "");
    // Strip markdown bold/italic
    s = s.replace(/\*\*(.*?)\*\*/g, "$1");
    s = s.replace(/__(.*?)__/g, "$1");
    s = s.replace(/\*(.*?)\*/g, "$1");

    return s.replace(/\s{2,}/g, " ").trim();
  }

  function cleanValue(val: any): any {
    if (typeof val === "string") return cleanString(val);
    if (Array.isArray(val)) return val.map(cleanValue);
    if (val && typeof val === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = cleanValue(v);
      }
      return out;
    }
    return val;
  }

  // Clean all values in contentData
  for (const key of Object.keys(data)) {
    data[key] = cleanValue(data[key]);
  }

  // Force the offer name into title fields if the AI invented something else
  if (offerName) {
    const titleKeys = ["hero_title", "main_headline", "headline", "challenge_name"];
    for (const k of titleKeys) {
      if (data[k] && typeof data[k] === "string") {
        // If the title contains "Challenge" but the offer is not a challenge, replace
        if (/Challenge\s+[A-Z]/i.test(data[k]) && !/challenge/i.test(offerName)) {
          data[k] = data[k].replace(/Challenge\s+[A-Z][^\s,.]*/i, offerName);
        }
      }
    }
  }

  // Strip counter/places sections if no urgency
  if (!hasUrgency) {
    const counterKeys = Object.keys(data).filter(k =>
      /counter|places_rest|remaining|spots/i.test(k)
    );
    for (const k of counterKeys) {
      data[k] = Array.isArray(data[k]) ? [] : "";
    }
  }

  // Strip invented guarantees if user didn't provide any
  const hasGuarantees = !!(input.offerGuarantees || "").trim();
  if (!hasGuarantees) {
    const guaranteeKeys = Object.keys(data).filter(k =>
      /guarantee|garantie/i.test(k)
    );
    for (const k of guaranteeKeys) {
      data[k] = Array.isArray(data[k]) ? [] : "";
    }
  }

  // Strip invented bonuses if user didn't provide any
  const hasBonuses = !!(input.offerBonuses || "").trim();
  if (!hasBonuses) {
    const bonusKeys = Object.keys(data).filter(k =>
      /^bonus/i.test(k)
    );
    for (const k of bonusKeys) {
      data[k] = Array.isArray(data[k]) ? [] : "";
    }
  }

  // Strip invented testimonials if user didn't provide any
  const hasTestimonials = Array.isArray(input.testimonials) && input.testimonials.length > 0;
  if (!hasTestimonials) {
    const testimonialKeys = Object.keys(data).filter(k =>
      /testimonial/i.test(k)
    );
    for (const k of testimonialKeys) {
      data[k] = Array.isArray(data[k]) ? [] : "";
    }
  }
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
