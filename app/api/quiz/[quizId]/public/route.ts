// app/api/quiz/[quizId]/public/route.ts
// Public endpoints for quiz visitors (no auth required).
// GET: fetch active quiz data
// POST: submit lead (email capture) + auto-send to Systeme.io with result tag
// PATCH: mark share + auto-apply share tag in Systeme.io

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getUserDEK } from "@/lib/piiKeys";
import { notifyCreatorOfResponse } from "@/lib/responseNotification";
import { encryptLeadPII } from "@/lib/piiCrypto";
import { isNewLeadLocked } from "@/lib/leadLock";
import { isPaidPlan } from "@/lib/planLimits";
import { applyFrenchTypography, isFrenchLocale } from "@/lib/frenchTypography";
import { resolveSioApiKey } from "@/lib/sio/resolveApiKey";
import { sendCapiLead } from "@/lib/metaCapi";
import { logBusinessEvent, dedupeKeys } from "@/lib/businessEvents";

// No `force-dynamic`: it would make Vercel inject `Cache-Control: private, no-store`,
// overriding the edge-SWR headers set on the GET response and forcing `cf-cache-status: DYNAMIC`.
export const maxDuration = 30;

type RouteContext = { params: Promise<{ quizId: string }> };

const SIO_BASE = "https://api.systeme.io/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a route parameter to a canonical quiz UUID.
 *
 * The public URL `/q/{param}` can be reached with either the quiz UUID (legacy
 * behaviour) or a user-defined slug. This helper returns the UUID so the rest
 * of the route can keep assuming it operates on `quizzes.id`.
 *
 * Returns null if nothing matches — caller should 404.
 */
async function resolveQuizId(param: string): Promise<string | null> {
  if (UUID_RE.test(param)) return param;
  const { data } = await supabaseAdmin
    .from("quizzes")
    .select("id")
    .ilike("slug", param)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

// ── Systeme.io helper ──────────────────────────────────────────

async function sioFetch(
  apiKey: string,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };
  let payload: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  const res = await fetch(`${SIO_BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Find-or-create a tag in Systeme.io, returns tagId or null.
 */
// Label lisible d'une URL (hostname sans www) — texte de footer par defaut
// quand seule l'URL du branding est fournie.
function hostnameLabel(url: string): string {
  const raw = url.trim();
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
  }
}

async function ensureSioTag(apiKey: string, tagName: string): Promise<number | null> {
  // Search existing
  const search = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
  if (search.ok && Array.isArray(search.data?.items)) {
    const match = search.data.items.find(
      (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
    );
    if (match?.id) return Number(match.id);
  }
  // Create
  const create = await sioFetch(apiKey, "/tags", { method: "POST", body: { name: tagName } });
  if (create.ok && create.data?.id) return Number(create.data.id);
  // Retry search (422 = already exists with slight mismatch)
  if (create.status === 422) {
    const retry = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
    if (retry.ok && Array.isArray(retry.data?.items)) {
      const match = retry.data.items.find(
        (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
      );
      if (match?.id) return Number(match.id);
    }
  }
  return null;
}

/**
 * Build SIO custom fields array from our field map.
 * `includeCountry` allows retrying without the country slug if SIO rejects it.
 */
function buildSioFields(
  fields: { firstName?: string; surname?: string; phoneNumber?: string; country?: string } | undefined,
  includeCountry: boolean,
): { slug: string; value: string }[] {
  if (!fields) return [];
  const out: { slug: string; value: string }[] = [];
  if (fields.firstName) out.push({ slug: "first_name", value: fields.firstName });
  if (fields.surname) out.push({ slug: "surname", value: fields.surname });
  if (fields.phoneNumber) out.push({ slug: "phone_number", value: fields.phoneNumber });
  if (includeCountry && fields.country) out.push({ slug: "country", value: fields.country });
  return out;
}

/**
 * Find-or-create a contact in Systeme.io, returns contactId or null.
 * Handles SIO accounts that don't have a "country" custom field:
 * if creating/updating with country fails (422), retries WITHOUT country.
 */
async function ensureSioContact(
  apiKey: string,
  email: string,
  fields?: { firstName?: string; surname?: string; phoneNumber?: string; country?: string },
): Promise<number | null> {
  const search = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
  if (search.ok && Array.isArray(search.data?.items) && search.data.items.length > 0) {
    const existingId = Number(search.data.items[0].id);
    // Update existing contact with any new fields (phone, country, name)
    if (fields && Object.values(fields).some(Boolean)) {
      const patchFields = buildSioFields(fields, true);
      if (patchFields.length > 0) {
        const patchRes = await sioFetch(apiKey, `/contacts/${existingId}`, {
          method: "PATCH",
          body: { fields: patchFields },
        });
        // If PATCH failed (likely invalid "country" slug), retry without country
        if (!patchRes.ok && fields.country) {
          const fallbackFields = buildSioFields(fields, false);
          if (fallbackFields.length > 0) {
            await sioFetch(apiKey, `/contacts/${existingId}`, {
              method: "PATCH",
              body: { fields: fallbackFields },
            });
          }
        }
      }
    }
    return existingId;
  }

  // Contact not found — create it
  const contactBody: Record<string, unknown> = { email, locale: "fr" };
  const sioFields = buildSioFields(fields, true);
  if (sioFields.length > 0) contactBody.fields = sioFields;

  const create = await sioFetch(apiKey, "/contacts", { method: "POST", body: contactBody });
  if (create.ok && create.data?.id) return Number(create.data.id);

  // 422 can mean: (a) contact already exists, or (b) invalid field slug (e.g. "country")
  if (create.status === 422) {
    // First check if the contact actually exists (case a)
    const retrySearch = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
    if (retrySearch.ok && Array.isArray(retrySearch.data?.items) && retrySearch.data.items.length > 0) {
      return Number(retrySearch.data.items[0].id);
    }

    // Contact doesn't exist — the 422 was likely due to invalid field slug (case b: "country")
    // Retry creation without country field
    if (fields?.country) {
      const fallbackBody: Record<string, unknown> = { email, locale: "fr" };
      const fallbackFields = buildSioFields(fields, false);
      if (fallbackFields.length > 0) fallbackBody.fields = fallbackFields;

      const retryCreate = await sioFetch(apiKey, "/contacts", { method: "POST", body: fallbackBody });
      if (retryCreate.ok && retryCreate.data?.id) return Number(retryCreate.data.id);

      // Still 422? Truly already exists
      if (retryCreate.status === 422) {
        const finalSearch = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
        if (finalSearch.ok && Array.isArray(finalSearch.data?.items) && finalSearch.data.items.length > 0) {
          return Number(finalSearch.data.items[0].id);
        }
      }
    }
  }
  return null;
}

/**
 * Apply a tag to a contact in Systeme.io (fire & forget style).
 */
async function applyTagToContact(
  apiKey: string,
  email: string,
  tagName: string,
  fields?: { firstName?: string; surname?: string; phoneNumber?: string; country?: string },
): Promise<number | null> {
  try {
    const tagId = await ensureSioTag(apiKey, tagName);
    if (!tagId) return null;
    const contactId = await ensureSioContact(apiKey, email, fields);
    if (!contactId) return null;
    await sioFetch(apiKey, `/contacts/${contactId}/tags`, { method: "POST", body: { tagId } });
    return contactId;
  } catch (e) {
    console.error("[Systeme.io auto-tag] Error:", e);
    return null;
  }
}

/**
 * Enrich SIO contact with quiz result as custom field.
 */
async function enrichSioContact(
  apiKey: string,
  contactId: number,
  quizResultTitle: string,
) {
  try {
    await sioFetch(apiKey, `/contacts/${contactId}`, {
      method: "PATCH",
      body: {
        fields: [
          { slug: "tipote_quiz_result", value: quizResultTitle },
        ],
      },
    });
  } catch (e) {
    console.error("[Systeme.io enrich] Error:", e);
  }
}

/**
 * Enroll a SIO contact in a course.
 */
async function enrollInSioCourse(apiKey: string, courseId: string, contactId: number) {
  try {
    const res = await sioFetch(apiKey, `/school/courses/${courseId}/enrollments`, {
      method: "POST",
      body: { contactId },
    });
    if (res.ok) {
      console.log(`[Systeme.io] Enrolled contact ${contactId} in course ${courseId}`);
    } else {
      console.warn(`[Systeme.io] Course enrollment failed (${res.status}):`, res.data);
    }
  } catch (e) {
    console.error("[Systeme.io course enrollment] Error:", e);
  }
}

/**
 * Add a SIO contact to a community.
 */
async function addToSioCommunity(apiKey: string, communityId: string, contactId: number) {
  try {
    const res = await sioFetch(apiKey, `/community/communities/${communityId}/memberships`, {
      method: "POST",
      body: { contactId },
    });
    if (res.ok) {
      console.log(`[Systeme.io] Added contact ${contactId} to community ${communityId}`);
    } else {
      console.warn(`[Systeme.io] Community add failed (${res.status}):`, res.data);
    }
  } catch (e) {
    console.error("[Systeme.io community add] Error:", e);
  }
}

// ── GET — public quiz data (active OR owner-preview) ──────────
//
// Bug Fabienne 2026-05-09 : avant, on filtrait `status = 'active'` direct
// dans la query, donc un quiz en brouillon n'était jamais accessible
// — même par son créateur en mode aperçu (`?preview_name=...`). Du
// coup l'user voyait la bannière orange "Mode aperçu — Bonjour Alex"
// + une page vide en dessous, et concluait "il n'y a pas d'aperçu".
//
// Maintenant : on fetch le quiz sans filtre status, puis on autorise
//   • status === "active"          → tout le monde (visiteurs publics)
//   • status === "draft" + owner   → uniquement le créateur authentifié
// Sinon 404. La réponse "owner preview" est marquée `no-store` pour
// échapper au cache CDN (sinon un visiteur anonyme pourrait servir
// du draft cached).

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId: param } = await context.params;
    const admin = supabaseAdmin;

    const quizId = await resolveQuizId(param);
    if (!quizId) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const [quizRes, questionsRes, resultsRes] = await Promise.all([
      admin.from("quizzes").select("id,user_id,project_id,status,title,slug,introduction,cta_text,cta_url,privacy_url,consent_text,virality_enabled,bonus_description,bonus_intro_text,bonus_image_url,bonus_image_position,bonus_image_width,bonus_unlocked_message,share_message,share_networks,locale,views_count,capture_heading,capture_subtitle,capture_submit_text,capture_before_questions,survey_thanks_heading,survey_thanks_body,capture_first_name,capture_last_name,capture_phone,capture_country,phone_required,first_name_required,last_name_required,country_required,ask_first_name,ask_gender,start_button_text,og_description,og_image_url,custom_footer_text,custom_footer_url,result_insight_heading,result_projection_heading,brand_font,brand_color_primary,brand_color_background,brand_color_text,brand_logo_url,hide_brand_logo,toast_widget_id,share_widget_id,show_consent_checkbox,show_results_breakdown,show_other_results,meta_pixel_id,ga4_measurement_id,google_ads_conversion_id,google_ads_conversion_label,mode,intro_image_url,intro_image_position,intro_image_width").eq("id", quizId).maybeSingle(),
      admin.from("quiz_questions").select("id,question_text,options,sort_order,question_type,config").eq("quiz_id", quizId).order("sort_order"),
      admin.from("quiz_results").select("id,title,description,insight,projection,insight_heading,projection_heading,cta_text,cta_url,sort_order,image_url,image_position,image_width,min_score,max_score").eq("quiz_id", quizId).order("sort_order"),
    ]);

    // DIAGNOSTIC 2 juin 2026 — log la vraie raison du 404 (colonne
    // manquante, schema cache stale, etc.) pour identifier la cause
    // du "Quiz not found or inactive" généralisé en prod.
    if (quizRes.error) {
      console.error("[public/GET] quizzes SELECT error:", {
        quizId,
        code: quizRes.error.code,
        message: quizRes.error.message,
        details: quizRes.error.details,
        hint: quizRes.error.hint,
      });
    }
    if (questionsRes.error) {
      console.error("[public/GET] quiz_questions SELECT error:", {
        quizId,
        code: questionsRes.error.code,
        message: questionsRes.error.message,
      });
    }
    if (resultsRes.error) {
      console.error("[public/GET] quiz_results SELECT error:", {
        quizId,
        code: resultsRes.error.code,
        message: resultsRes.error.message,
      });
    }

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const quizStatus = String((quizRes.data as { status?: string | null }).status ?? "");
    const isActive = quizStatus === "active";
    let isOwnerPreview = false;
    if (!isActive) {
      // Tente de lire l'user authentifié (silencieux si anonyme).
      try {
        const supabase = await getSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        const ownerId = (quizRes.data as { user_id?: string | null }).user_id ?? null;
        if (user && ownerId && user.id === ownerId) {
          isOwnerPreview = true;
        }
      } catch {
        // pas d'auth context → on tombe sur le 404 plus bas
      }
      if (!isOwnerPreview) {
        return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
      }
    }

    // Fetch creator's address_form + privacy_url + branding fallback from business_profiles
    const quizUserId = (quizRes.data as any).user_id as string | undefined;
    const quizProjectId = (quizRes.data as any).project_id as string | null | undefined;
    let addressForm = "tu";
    let fallbackPrivacyUrl = "";
    let brandFallback: { brand_font: string | null; brand_color_base: string | null; brand_logo_url: string | null } = { brand_font: null, brand_color_base: null, brand_logo_url: null };
    // Branding profil pour le fallback footer (Gwenn 12 juillet 2026 :
    // "j'ai mis l'url du site dans le branding" -> on la remonte dans le
    // footer si le champ pied-de-page par-quiz est vide).
    let brandWebsiteUrl = "";
    let brandSiteName = "";
    let tipoteAffiliateId: string | null = null;
    let pixelDefaults: { meta: string | null; ga4: string | null; ads: string | null; adsLabel: string | null } = { meta: null, ga4: null, ads: null, adsLabel: null };
    if (quizUserId) {
      let bpQuery = admin
        .from("business_profiles")
        .select("address_form, privacy_url, brand_font, brand_color_base, brand_logo_url, brand_website_url, share_site_name, tipote_affiliate_id, default_meta_pixel_id, default_ga4_measurement_id, default_google_ads_conversion_id, default_google_ads_conversion_label")
        .eq("user_id", quizUserId);
      if (quizProjectId) bpQuery = bpQuery.eq("project_id", quizProjectId);
      const { data: bp } = await bpQuery.maybeSingle();
      addressForm = (bp as any)?.address_form === "vous" ? "vous" : "tu";
      fallbackPrivacyUrl = String((bp as any)?.privacy_url ?? "").trim();
      brandWebsiteUrl = String((bp as any)?.brand_website_url ?? "").trim();
      brandSiteName = String((bp as any)?.share_site_name ?? "").trim();
      brandFallback = {
        brand_font: (bp as any)?.brand_font ?? null,
        brand_color_base: (bp as any)?.brand_color_base ?? null,
        brand_logo_url: (bp as any)?.brand_logo_url ?? null,
      };
      tipoteAffiliateId = String((bp as any)?.tipote_affiliate_id ?? "").trim() || null;
      pixelDefaults = {
        meta: String((bp as any)?.default_meta_pixel_id ?? "").trim() || null,
        ga4: String((bp as any)?.default_ga4_measurement_id ?? "").trim() || null,
        ads: String((bp as any)?.default_google_ads_conversion_id ?? "").trim() || null,
        adsLabel: String((bp as any)?.default_google_ads_conversion_label ?? "").trim() || null,
      };
    }

    // Refonte tracking (Adeline, 19 mai 2026) : le view tracking
    // n'est PLUS fait ici (server-side, à chaque GET) parce que :
    //   - bots qui n'exécutent pas JS comptaient quand même
    //   - refreshes / preloads gonflaient les chiffres
    //   - le créateur qui partageait son lien le voyait compté
    // Le visiteur fire maintenant un event "view" via POST /track
    // depuis useEffect au mount → bot filtering + cookie dédup +
    // owner exclusion + insert via log_quiz_event RPC qui passe par
    // le trigger pour bumper le compteur. Source de vérité unique.
    void isOwnerPreview; // ancienne logique remplacée par /track

    // Widget resolution: per-quiz override first, else first enabled widget
    // of the creator. An override is only honored if it still exists, still
    // belongs to the creator, and is still enabled (prevents a stale or
    // disabled widget from silently rendering).
    let toastWidgetId: string | null = null;
    let shareWidgetId: string | null = null;
    if (quizUserId) {
      const overrideToast = (quizRes.data as any).toast_widget_id as string | null | undefined;
      const overrideShare = (quizRes.data as any).share_widget_id as string | null | undefined;
      try {
        const [twOverride, swOverride] = await Promise.all([
          overrideToast
            ? admin
                .from("toast_widgets")
                .select("id")
                .eq("id", overrideToast)
                .eq("user_id", quizUserId)
                .eq("enabled", true)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
          overrideShare
            ? admin
                .from("social_share_widgets")
                .select("id")
                .eq("id", overrideShare)
                .eq("user_id", quizUserId)
                .eq("enabled", true)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);
        toastWidgetId = twOverride?.data?.id ?? null;
        shareWidgetId = swOverride?.data?.id ?? null;

        // Béné 2026-05-11 : avant ce commit, si le quiz n'avait pas de
        // override explicite, on tombait sur le premier widget activé du
        // créateur. Effet de bord : un widget partage créé dans son compte
        // (onboarding défaut, test, vieux widget) se collait sur TOUS ses
        // quiz, y compris celui où elle n'avait jamais coché l'option.
        // Imagelys a remonté le bug sur son quiz public où des boutons
        // sociaux s'affichaient sans qu'elle les ait activés.
        //
        // Nouveau comportement : pas de fallback. Si le quiz n'a pas
        // d'override → le widget ne s'affiche pas. Opt-in explicite via
        // l'éditeur (champ toast_widget_id / share_widget_id).
        // Le toast widget garde son fallback historique pour ne pas casser
        // les comptes qui s'en servaient sans le savoir — uniquement le
        // share widget passe en strict opt-in (c'est lui qui causait le
        // dérangement visuel sur la page publique).
        const needToast = !toastWidgetId;
        if (needToast) {
          const twFirst = await admin
            .from("toast_widgets")
            .select("id")
            .eq("user_id", quizUserId)
            .eq("enabled", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          toastWidgetId = twFirst?.data?.id ?? null;
        }
      } catch {
        // fail-open
      }
    }

    // Strip user_id + widget override columns from the public quiz payload —
    // the resolved widget IDs are already surfaced at the top level.
    const {
      user_id: _uid,
      toast_widget_id: _tw,
      share_widget_id: _sw,
      ...quizPublic
    } = quizRes.data as any;
    const effectivePrivacyUrl = String(quizPublic.privacy_url ?? "").trim() || fallbackPrivacyUrl;

    // Pixel effectif : fallback sur les défauts business_profile si le
    // quiz n'a aucun ID, pour que les events conversion (Lead/share)
    // côté client fired sur le bon pixel. Le pixel server-rendered
    // (PageView) applique la même logique. Cf. PITFALLS section U.
    const quizHasPixel =
      String(quizPublic.meta_pixel_id ?? "").trim() ||
      String(quizPublic.ga4_measurement_id ?? "").trim() ||
      String(quizPublic.google_ads_conversion_id ?? "").trim();
    if (!quizHasPixel) {
      quizPublic.meta_pixel_id = pixelDefaults.meta;
      quizPublic.ga4_measurement_id = pixelDefaults.ga4;
      quizPublic.google_ads_conversion_id = pixelDefaults.ads;
      quizPublic.google_ads_conversion_label = pixelDefaults.adsLabel;
    }

    // Custom footer is a paid-plan feature: if the creator is on free, hide it
    // at render time too (guards against downgrades where the field is still
    // stored in DB).
    if (quizUserId) {
      const { data: planRow } = await admin
        .from("profiles")
        .select("plan")
        .eq("id", quizUserId)
        .maybeSingle();
      const plan = String((planRow as { plan?: string | null } | null)?.plan ?? "free").toLowerCase();
      // Fallback footer : priorite au champ PAR QUIZ, sinon URL du Branding
      // (brand_website_url) + nom de site (share_site_name / hostname).
      // Gwenn 12 juillet 2026 : l'URL mise dans le Branding doit remonter
      // dans le footer sans repasser par le champ par-quiz.
      const perQuizFooterText = String(quizPublic.custom_footer_text ?? "").trim();
      const perQuizFooterUrl = String(quizPublic.custom_footer_url ?? "").trim();
      const resolvedFooterUrl = perQuizFooterUrl || brandWebsiteUrl || "";
      let resolvedFooterText = perQuizFooterText;
      if (resolvedFooterUrl && !resolvedFooterText) {
        resolvedFooterText = brandSiteName || hostnameLabel(resolvedFooterUrl);
      }
      // Le footer perso reste reserve aux plans payants (le gratuit garde
      // le branding Tipote par defaut).
      const footerAllowed = plan !== "free";
      quizPublic.custom_footer_text = footerAllowed && resolvedFooterText ? resolvedFooterText : null;
      quizPublic.custom_footer_url = footerAllowed && resolvedFooterUrl ? resolvedFooterUrl : null;
    }

    // G1 — display-time French typography for legacy data. Apply NBSP rules
    // to text fields when the quiz locale is French, so quizzes saved before
    // the on-save typography pass landed (Round 2) still render correctly
    // without forcing creators to re-save every quiz.
    const quizLocale = quizPublic.locale as string | null;
    const fr = (s: any) => (typeof s === "string" ? applyFrenchTypography(s, quizLocale) : s);
    const renderedQuiz = isFrenchLocale(quizLocale)
      ? {
          ...quizPublic,
          title: fr(quizPublic.title),
          introduction: fr(quizPublic.introduction),
          cta_text: fr(quizPublic.cta_text),
          consent_text: fr(quizPublic.consent_text),
          bonus_description: fr(quizPublic.bonus_description),
          bonus_intro_text: fr(quizPublic.bonus_intro_text),
          share_message: fr(quizPublic.share_message),
          start_button_text: fr(quizPublic.start_button_text),
          capture_heading: fr(quizPublic.capture_heading),
          capture_subtitle: fr(quizPublic.capture_subtitle),
          capture_submit_text: fr(quizPublic.capture_submit_text),
          survey_thanks_heading: fr(quizPublic.survey_thanks_heading),
          survey_thanks_body: fr(quizPublic.survey_thanks_body),
          result_insight_heading: fr(quizPublic.result_insight_heading),
          result_projection_heading: fr(quizPublic.result_projection_heading),
          custom_footer_text: fr(quizPublic.custom_footer_text),
          og_description: fr(quizPublic.og_description),
        }
      : quizPublic;
    const renderedQuestions = (questionsRes.data ?? []).map((q: any) => ({
      ...q,
      question_text: isFrenchLocale(quizLocale) ? fr(q.question_text) : q.question_text,
      options: (q.options as { text: string; result_index: number }[] | null | undefined)
        ? (q.options as { text: string; result_index: number }[]).map((o) => ({
            ...o,
            text: isFrenchLocale(quizLocale) ? fr(o.text) : o.text,
          }))
        : q.options,
      question_type: (q.question_type as string) ?? "multiple_choice",
      config: (q.config as Record<string, unknown>) ?? {},
    }));
    const renderedResults = (resultsRes.data ?? []).map((r: any) => ({
      ...r,
      title: isFrenchLocale(quizLocale) ? fr(r.title) : r.title,
      description: isFrenchLocale(quizLocale) ? fr(r.description) : r.description,
      insight: isFrenchLocale(quizLocale) ? fr(r.insight) : r.insight,
      insight_heading: isFrenchLocale(quizLocale) ? fr(r.insight_heading) : r.insight_heading,
      projection_heading: isFrenchLocale(quizLocale) ? fr(r.projection_heading) : r.projection_heading,
      projection: isFrenchLocale(quizLocale) ? fr(r.projection) : r.projection,
      cta_text: isFrenchLocale(quizLocale) ? fr(r.cta_text) : r.cta_text,
    }));

    return NextResponse.json({
      ok: true,
      // Flag remonté quand le quiz est servi en mode aperçu (créateur
      // sur un quiz draft). Le client affiche un toast pour informer
      // qu'il faut publier pour partager — sinon l'user croit que tout
      // est ok côté visiteur.
      isDraftPreview: isOwnerPreview,
      toast_widget_id: toastWidgetId,
      share_widget_id: shareWidgetId,
      quiz: {
        ...renderedQuiz,
        address_form: addressForm,
        privacy_url: effectivePrivacyUrl || null,
        // Surfacé pour que le footer Tiquiz par défaut puisse y attacher
        // ?sa=<id> et faire toucher des commissions au créateur.
        tipote_affiliate_id: tipoteAffiliateId,
      },
      questions: renderedQuestions,
      results: renderedResults,
      // Creator-level branding fallback — PublicQuizClient resolves the final
      // look by overlaying per-quiz `brand_*` on top of these.
      brand_fallback: brandFallback,
    }, {
      // Quiz public actif → cache edge SWR comme avant.
      // Quiz draft servi à son créateur → no-store (sinon le CDN
      // pourrait servir du contenu de brouillon à un visiteur anonyme).
      headers: isOwnerPreview
        ? {
            "Cache-Control": "private, no-store, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Vercel-CDN-Cache-Control": "no-store",
          }
        : {
            // Edge SWR resilience (origin down → keep serving last-good).
            // - max-age=0: browser always revalidates → creator sees fresh
            // - s-maxage=60: edge caches 60s → cheap origin protection
            // - stale-while-revalidate=60: edge serves last-good seulement
            //   pendant 60s en plus (au lieu de 24h précédemment). Sinon,
            //   un visiteur qui a déjà ouvert l'URL voyait l'ancienne
            //   version pendant 24h après une édition (couleurs / titre)
            //   — bug remonté par Adeline (16 mai 2026, "couleur de base
            //   sur mon tel"). 60s SWR limite la fenêtre à ~2 min entre
            //   l'édit et l'apparition de la nouvelle version chez les
            //   visiteurs déjà cachés côté edge.
            "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
            "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
            "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
          },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── POST — submit lead + auto-tag in Systeme.io ────────────────

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId: param } = await context.params;
    const admin = supabaseAdmin;

    const quizId = await resolveQuizId(param);
    if (!quizId) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
    }

    // Verify quiz is active
    const { data: quiz } = await admin
      .from("quizzes")
      .select("id, user_id, project_id, title, meta_pixel_id, mode, sio_capture_tag")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const resultId = body.result_id ?? null;
    const firstName = String(body.first_name ?? "").trim().slice(0, 100);
    const lastName = String(body.last_name ?? "").trim().slice(0, 100);
    const phone = String(body.phone ?? "").trim().slice(0, 30);
    const country = String(body.country ?? "").trim().slice(0, 50);
    const rawGender = String(body.gender ?? "").trim().toLowerCase();
    const gender: "m" | "f" | "x" | null = rawGender === "m" || rawGender === "f" || rawGender === "x" ? rawGender : null;
    const answers = Array.isArray(body.answers) ? body.answers : null;

    // Données requête pour la Conversions API (Lead server-side). Le
    // meta_event_id vient du pixel navigateur → dédup. fbp/fbc/IP/UA
    // améliorent la qualité de correspondance (EMQ).
    const metaEventId = String(body.meta_event_id ?? "").trim();
    const clientIp =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent");
    const referer = req.headers.get("referer");
    const fbp = req.cookies.get("_fbp")?.value ?? null;
    const fbc = req.cookies.get("_fbc")?.value ?? null;

    // Upsert lead (unique on quiz_id + email)
    const { data: lead, error } = await admin
      .from("quiz_leads")
      .upsert(
        {
          quiz_id: quizId,
          email,
          first_name: firstName || null,
          last_name: lastName || null,
          phone: phone || null,
          country: country || null,
          result_id: resultId,
          consent_given: Boolean(body.consent_given),
          ...(gender ? { gender } : {}),
          ...(answers ? { answers } : {}),
        },
        { onConflict: "quiz_id,email" },
      )
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[POST /api/quiz/[quizId]/public] Lead insert error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // ── Log business event (fire-and-forget, non-blocking) ──
    // Dedup via dedupeKey = quiz_lead:<quizId>:<emailHash> → un seul event
    // par email par quiz, même si le visiteur soumet plusieurs fois.
    // Cf. ROADMAP_RETENTION.md phase 0 + PITFALLS section AR.
    logBusinessEvent({
      userId: quiz.user_id,
      projectId: quiz.project_id ?? null,
      kind: "lead_captured",
      source: "internal",
      payload: {
        quizId,
        quizTitle: quiz.title,
        resultId,
        leadId: lead?.id,
      },
      dedupeKey: dedupeKeys.quizLead(quizId, email),
    }).catch(() => {});

    // ── Notification créateur (best-effort, non bloquant) ──
    // Email au propriétaire quand une NOUVELLE réponse arrive, s'il n'a pas
    // coupé l'option. On ne notifie que sur un lead fraîchement créé
    // (created_at récent) pour éviter les doublons quand un même email
    // re-répond (upsert = update, created_at inchangé).
    if (lead?.id && quiz.user_id) {
      const createdAt = (lead as { created_at?: string | null }).created_at;
      const isNewLead = !createdAt || Date.now() - new Date(createdAt).getTime() < 15000;
      if (isNewLead) {
        notifyCreatorOfResponse({
          ownerUserId: quiz.user_id,
          projectId: quiz.project_id ?? null,
          quizId,
          quizTitle: quiz.title,
          quizMode: (quiz as { mode?: string | null }).mode ?? null,
          respondentEmail: email,
          respondentName: [firstName, lastName].filter(Boolean).join(" ") || null,
          resultId,
        }).catch(() => {});
      }
    }

    // ── Sync to unified leads table (non-blocking) ──
    (async () => {
      try {
        // Get result title
        let resultTitle: string | null = null;
        if (resultId) {
          const { data: result } = await admin
            .from("quiz_results")
            .select("title")
            .eq("id", resultId)
            .maybeSingle();
          resultTitle = result?.title ?? null;
        }

        // Encrypt PII with user's DEK
        const dek = await getUserDEK(admin, quiz.user_id);
        const encrypted = encryptLeadPII(
          { email, first_name: firstName || null, last_name: lastName || null, phone: phone || null, quiz_answers: answers },
          dek,
          quiz.user_id,
        );

        await admin
          .from("leads")
          .upsert(
            {
              user_id: quiz.user_id,
              project_id: quiz.project_id ?? null,
              email,
              first_name: firstName || null,
              last_name: lastName || null,
              phone: phone || null,
              ...encrypted,
              source: "quiz",
              source_id: quizId,
              source_name: quiz.title,
              quiz_answers: answers,
              // Stable lookup key : permet de resoudre le titre LIVE depuis
              // quiz_results meme apres rename. Le snapshot quiz_result_title
              // reste comme fallback si le result est supprime plus tard
              // (ON DELETE SET NULL — cf. migration 20260607_leads_quiz_result_id).
              quiz_result_id: resultId || null,
              quiz_result_title: resultTitle,
            },
            { onConflict: "user_id,source,source_id,email" },
          );
      } catch (e) {
        console.error("[leads sync] quiz lead error:", e);
      }
    })();

    // ── Auto-send to Systeme.io: tag + enrich + course + community (non-blocking) ──
    // Quiz : le tag vient du RESULTAT (quiz_results.sio_tag_name). Sondage :
    // pas de resultat, on applique le tag de capture defini au niveau du
    // sondage (quizzes.sio_capture_tag) a chaque lead. Parite avec Tiquiz.
    const isSurveyLead = (quiz as { mode?: string | null }).mode === "survey";
    const surveyCaptureTag = isSurveyLead
      ? String((quiz as { sio_capture_tag?: string | null }).sio_capture_tag ?? "").trim()
      : "";
    if (resultId || surveyCaptureTag) {
      // Fire & forget: don't await so the response is fast
      (async () => {
        try {
          // Free-tier guard: if this brand-new lead is already locked for the
          // creator (rolling-window cap reached), don't push it to SIO either
          // — paying for SIO would otherwise be a trivial way to lift the
          // blur the leads UI applies.
          const { data: planRow } = await admin
            .from("profiles")
            .select("plan")
            .eq("id", quiz.user_id)
            .maybeSingle();
          const plan = String((planRow as { plan?: string | null } | null)?.plan ?? "free");
          if (!isPaidPlan(plan)) {
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data: ownedQuizzes } = await admin
              .from("quizzes")
              .select("id")
              .eq("user_id", quiz.user_id);
            const ownedQuizIds = (ownedQuizzes ?? []).map((q: { id: string }) => q.id);
            if (ownedQuizIds.length > 0) {
              const { count } = await admin
                .from("quiz_leads")
                .select("id", { count: "exact", head: true })
                .in("quiz_id", ownedQuizIds)
                .gte("created_at", since);
              if (isNewLeadLocked(count ?? 0, plan)) return;
            }
          }

          // Quiz : config SIO portee par le resultat. Sondage : pas de
          // resultat, seul le tag de capture du sondage s'applique (pas de
          // course/community/enrich par profil, qui n'existent pas ici).
          // Multi-tags par profil (Gwenn 12 juillet 2026) : on applique TOUS
          // les tags de sio_tag_names ; fallback sur l'ancien sio_tag_name
          // single (profils existants). Le tag de capture sondage s'ajoute.
          let resultTags: string[] = [];
          let courseId = "";
          let communityId = "";
          let resultTitle = "";
          if (resultId) {
            const { data: result } = await admin
              .from("quiz_results")
              .select("sio_tag_name, sio_tag_names, sio_course_id, sio_community_id, title")
              .eq("id", resultId)
              .maybeSingle();
            const rawTags = (result as Record<string, unknown> | null)?.sio_tag_names;
            const arrTags = Array.isArray(rawTags)
              ? rawTags.map((v) => String(v ?? "").trim()).filter(Boolean)
              : [];
            const singleTag = String(result?.sio_tag_name ?? "").trim();
            resultTags = arrTags.length > 0 ? arrTags : (singleTag ? [singleTag] : []);
            courseId = String(result?.sio_course_id ?? "").trim();
            communityId = String(result?.sio_community_id ?? "").trim();
            resultTitle = String(result?.title ?? "").trim();
          }

          // Get the quiz owner's API key (scoped by project, decrypted)
          const apiKey = (await resolveSioApiKey(admin, quiz.user_id, quiz.project_id)) ?? "";
          if (!apiKey) return;

          const tagsToApply = [...resultTags, surveyCaptureTag]
            .map((t) => t.trim())
            .filter((t, i, arr) => t && arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);

          // 1. Ensure the contact exists, then apply every tag.
          const sioContactId = await ensureSioContact(apiKey, email, {
            firstName: firstName || undefined,
            surname: lastName || undefined,
            phoneNumber: phone || undefined,
            country: country || undefined,
          });
          if (!sioContactId) return;

          for (const tagName of tagsToApply) {
            try {
              const tagId = await ensureSioTag(apiKey, tagName);
              if (!tagId) continue;
              await sioFetch(apiKey, `/contacts/${sioContactId}/tags`, { method: "POST", body: { tagId } });
              console.log(`[Systeme.io] Tagged ${email} with "${tagName}" for quiz ${quizId}`);
            } catch (e) {
              console.error("[Systeme.io tag apply] Error:", e);
            }
          }

          // 2. Enrich contact with quiz result as custom field
          if (resultTitle) {
            await enrichSioContact(apiKey, sioContactId, resultTitle);
          }

          // 3. Auto-enroll in SIO course if configured
          if (courseId) {
            await enrollInSioCourse(apiKey, courseId, sioContactId);
          }

          // 4. Auto-add to SIO community if configured
          if (communityId) {
            await addToSioCommunity(apiKey, communityId, sioContactId);
          }
        } catch (e) {
          console.error("[Systeme.io auto-tag POST] Error:", e);
        }
      })();
    }

    // ── Meta Conversions API : Lead server-side (dédup via event_id
    //    partagé avec le pixel navigateur). Fire-and-forget, no-op si
    //    pas de pixel/token configuré. Le token (secret) reste serveur.
    (async () => {
      try {
        if (!metaEventId) return;
        let bpQuery = admin
          .from("business_profiles")
          .select("default_meta_pixel_id, default_meta_capi_token")
          .eq("user_id", quiz.user_id);
        if (quiz.project_id) bpQuery = bpQuery.eq("project_id", quiz.project_id);
        const { data: bp } = await bpQuery.maybeSingle();
        const p = bp as {
          default_meta_pixel_id?: string | null;
          default_meta_capi_token?: string | null;
        } | null;
        const pixelId =
          String((quiz as { meta_pixel_id?: string | null }).meta_pixel_id ?? "").trim() ||
          (p?.default_meta_pixel_id?.trim() ?? "");
        const token = p?.default_meta_capi_token?.trim() ?? "";
        if (!pixelId || !token) return;
        await sendCapiLead({
          pixelId,
          token,
          eventId: metaEventId,
          eventSourceUrl: referer,
          contentName: (quiz as { title?: string | null }).title ?? null,
          user: { email, firstName, lastName, phone, country, clientIp, userAgent, fbp, fbc },
        });
      } catch (e) {
        console.error("[Tipote][CAPI] Lead POST error:", e);
      }
    })();

    return NextResponse.json({ ok: true, leadId: lead?.id });
  } catch (e) {
    console.error("[POST /api/quiz/[quizId]/public] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── PATCH — mark share + auto-apply share tag ──────────────────

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId: param } = await context.params;
    const admin = supabaseAdmin;

    const quizId = await resolveQuizId(param);
    if (!quizId) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
    }

    const { error } = await admin
      .from("quiz_leads")
      .update({ has_shared: true, bonus_unlocked: true })
      .eq("quiz_id", quizId)
      .eq("email", email);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Increment share count on quiz + get share tag
    const { data: quiz } = await admin
      .from("quizzes")
      .select("shares_count, sio_share_tag_name, user_id, project_id")
      .eq("id", quizId)
      .maybeSingle();

    if (quiz) {
      // Refonte tracking (19 mai 2026) : INSERT direct dans quiz_events →
      // trigger bumpe shares_count. Source de vérité unique (quiz_events),
      // sans dépendre de la RPC log_quiz_event (insert direct = erreur lue,
      // pas de risque de surcharge). Pas de session_id ici (event server-side).
      const { error: shareErr } = await admin
        .from("quiz_events")
        .insert({ quiz_id: quizId, event_type: "share", meta: null, session_id: null });
      if (shareErr) console.error("[public/share] quiz_events insert failed", shareErr);

      // Log business_event (fire-and-forget, non-bloquant). Dedupe par
      // email pour ne pas re-compter si un visiteur partage 2x depuis
      // 2 onglets. Cf. ROADMAP_RETENTION phase 1.5.
      if (!shareErr && quiz.user_id) {
        logBusinessEvent({
          userId: quiz.user_id as string,
          projectId: (quiz.project_id as string | null) ?? null,
          kind: "quiz_share",
          source: "internal",
          payload: { quizId, side: "server", email },
          dedupeKey: `quiz_share:${quizId}:${email.toLowerCase()}`,
        }).catch(() => {});
      }

      // ── Auto-apply share tag in Systeme.io (non-blocking) ──
      const shareTagName = String(quiz.sio_share_tag_name ?? "").trim();
      if (shareTagName && quiz.user_id) {
        (async () => {
          try {
            const apiKey = (await resolveSioApiKey(admin, quiz.user_id, quiz.project_id)) ?? "";
            if (!apiKey) return;

            await applyTagToContact(apiKey, email, shareTagName);
            console.log(`[Systeme.io] Tagged ${email} with share tag "${shareTagName}" for quiz ${quizId}`);
          } catch (e) {
            console.error("[Systeme.io auto-tag PATCH] Error:", e);
          }
        })();
      }
    }

    return NextResponse.json({ ok: true, bonus_unlocked: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
