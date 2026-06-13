// POST /api/pod/ai-suggest
//
// Appelé par l'extension Chrome quand l'utilisateur ouvre le badge
// Tipote sur un post LinkedIn HORS pod ("mode Kawaak" pour commenter
// rapidement n'importe quel post avec assistance IA — Béné, 19 mai 2026).
//
// Pour les posts du pod, les suggestions sont pré-générées au fan-out
// (cf. fanOutForPod dans podBoostService.ts), donc l'extension lit
// directement depuis la task. Ici c'est juste pour le cas on-demand.
//
// v2 (21 mai 2026) : on lookup le profil + business_profile du user
// pour injecter dans le prompt son ton de voix, son audience, ses
// expressions perso. But : que les commentaires sonnent comme l'user
// et pas comme un GPT-4 générique (retour Béné).
//
// Rate limiting : pas de quota strict pour l'instant — Phase 4. À
// surveiller dans les logs si abus.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { generateSuggestions, type CommenterContext } from "@/lib/podAiSuggest";

// Buffer (base64 image) + fetch d'image externe => runtime Node requis.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vision : récupération de l'image du post pour que Claude la commente.
// Garde anti-SSRF : on n'accepte QUE des URLs https des CDN sociaux
// connus (l'extension n'envoie de toute façon que des src d'<img> de
// la page). Cap de taille pour éviter les abus.
const ALLOWED_IMAGE_HOST_RE =
  /(?:^|\.)(fbcdn\.net|cdninstagram\.com|licdn\.com|twimg\.com|cdn-images-1\.medium\.com|redditmedia\.com|redd\.it|tiktokcdn\.com|tiktokcdn-us\.com|fna\.fbcdn\.net)$/i;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 Mo
const SUPPORTED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function fetchPostImage(
  rawUrl: string,
): Promise<{ media_type: string; data: string } | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_IMAGE_HOST_RE.test(url.hostname)) {
    console.warn("[ai-suggest] image host not allowed:", url.hostname);
    return null;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { Accept: "image/*" },
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED_MEDIA.has(ct)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return { media_type: ct, data: Buffer.from(buf).toString("base64") };
  } catch (err) {
    console.warn("[ai-suggest] fetchPostImage failed", (err as Error).message);
    return null;
  }
}

/** Lookup du contexte de personnalisation du commenter. Tous les
 *  champs optionnels — si manquants, le prompt reste générique. */
async function fetchCommenterContext(userId: string): Promise<{
  context: CommenterContext;
  /** "post" = suivre la langue du post (défaut), "user" = langue de
   *  contenu de l'user, ou un code ISO 2 lettres pour forcer une langue. */
  replyLanguageMode: string;
  contentLocale: string | null;
}> {
  const supabase = await getSupabaseServerClient();
  const projectId = await getActiveProjectId(supabase, userId);

  // LinkedIn profile (côté pod) — pour le headline et le nom.
  const { data: liProfile } = await supabaseAdmin
    .from("pod_linkedin_profiles")
    .select("full_name, headline")
    .eq("user_id", userId)
    .maybeSingle();

  // Business profile (côté project) — pour ton de voix, audience,
  // DOMAINE/MÉTIER (niche + mission), langage perso. Scopé par project_id.
  // ⚠️ niche/mission = le domaine réel de l'user issu de l'onboarding.
  // Sans ça, le modèle ignorait que JB fait de la photo et sortait des
  // commentaires business hors-sujet (drame Béné 13 juin 2026).
  type BizProfile = {
    brand_tone_of_voice?: string | null;
    target_audience?: string | null;
    auto_comment_style_ton?: string | null;
    auto_comment_objectifs?: string[] | null;
    auto_comment_langage?: Record<string, unknown> | null;
    content_locale?: string | null;
    niche?: string | null;
    mission?: string | null;
  };
  let businessProfile: BizProfile | null = null;

  // select("*") best-effort : si une colonne manque en prod (niche,
  // mission...), un select nominatif planterait toute la perso. select *
  // est tolérant. Fallback any-project si pas de projet actif résolu.
  if (projectId) {
    const { data } = await supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .maybeSingle();
    businessProfile = (data ?? null) as BizProfile | null;
  }
  if (!businessProfile) {
    const { data } = await supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    businessProfile = (data ?? null) as BizProfile | null;
  }

  const langageRaw = (businessProfile?.auto_comment_langage ?? null) as {
    keywords?: unknown;
    mots_cles?: unknown;
    expressions?: unknown;
    emojis?: unknown;
    reply_language_mode?: unknown;
    address_form?: unknown;
    domain?: unknown;
  } | null;
  const asStringArray = (v: unknown) =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : undefined;
  const langage = langageRaw
    ? {
        // ⚠️ AutoCommentSettings sauve sous `mots_cles` (schéma zod),
        // d'anciens writes utilisaient `keywords`. On lit LES DEUX,
        // sinon les mots-clés saisis dans Réglages -> Boost ne sont
        // jamais injectés dans le prompt (bug détecté 12 juin 2026).
        keywords: asStringArray(langageRaw.keywords) ?? asStringArray(langageRaw.mots_cles),
        expressions: asStringArray(langageRaw.expressions),
        emojis: asStringArray(langageRaw.emojis),
      }
    : null;

  const addressForm =
    langageRaw?.address_form === "tu" || langageRaw?.address_form === "vous"
      ? (langageRaw.address_form as "tu" | "vous")
      : "auto";
  // reply_language_mode : "post" | "user" | code ISO 2 lettres.
  const rlmRaw = typeof langageRaw?.reply_language_mode === "string"
    ? langageRaw.reply_language_mode.trim().toLowerCase()
    : "post";
  const replyLanguageMode = /^[a-z]{2}$/.test(rlmRaw) || rlmRaw === "user" ? rlmRaw : "post";

  // DOMAINE injecté dans le prompt, par ordre de priorité :
  // 1. domaine explicite saisi dans le popup (override manuel)
  // 2. niche de l'onboarding (la source de vérité du métier de l'user)
  // 3. mission (fallback)
  const explicitDomain =
    typeof langageRaw?.domain === "string" && langageRaw.domain.trim()
      ? langageRaw.domain.trim()
      : null;
  const niche = businessProfile?.niche?.trim() || null;
  const mission = businessProfile?.mission?.trim() || null;
  const domain = explicitDomain ?? niche ?? mission;

  return {
    context: {
      fullName: liProfile?.full_name ?? null,
      headline: liProfile?.headline ?? null,
      toneOfVoice: businessProfile?.brand_tone_of_voice ?? null,
      targetAudience: businessProfile?.target_audience ?? null,
      styleCategory: businessProfile?.auto_comment_style_ton ?? null,
      objectives: businessProfile?.auto_comment_objectifs ?? null,
      langage: langage && (langage.keywords?.length || langage.expressions?.length || langage.emojis?.length) ? langage : null,
      addressForm,
      // Domaine tronqué : la niche peut être longue (positionnement
      // complet), on garde l'essentiel pour ne pas noyer le prompt.
      domain: domain ? domain.slice(0, 300) : null,
    },
    replyLanguageMode,
    contentLocale: businessProfile?.content_locale ?? null,
  };
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    activity_urn?: string;
    content_excerpt?: string;
    language?: string;
    /** Réseau social d'où vient le post (facebook, instagram...). */
    network?: string;
    /** URL de l'image principale du post (vision). L'extension
     *  l'extrait du DOM. Récupérée + base64 ici (garde anti-SSRF). */
    image_url?: string;
    /** Free-form hint from the user when they hit "Regenerate" in the
     *  badge (ex: "plus court", "moins formel", "parle de ton expé"). */
    indications?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // activity_urn pas strictement requis pour le call IA (le contenu
  // suffit) — utile en log pour diag + futur cache par URN.
  // `language` envoyé par l'extension = langue du navigateur, PAS celle
  // du post. On ne s'en sert plus que comme fallback quand le post n'a
  // pas de texte (image) ET qu'aucune langue n'est forcée.
  let language = body.language?.trim().toLowerCase() || "fr";
  const network = body.network?.trim().toLowerCase() || null;
  const excerpt = body.content_excerpt?.trim() || null;
  const indications = body.indications?.trim().slice(0, 400) || null;

  // Résolution de la langue (Béné 13 juin 2026) :
  //   - "user"  -> on force la langue de contenu de l'user
  //   - code    -> on force cette langue (l'user a choisi explicitement)
  //   - "post"  -> matchPostLanguage : le modèle répond dans la langue
  //                du post (le plus robuste, fini les commentaires FR sur
  //                des posts EN).
  let matchPostLanguage = true;
  let commenter: CommenterContext | undefined;
  try {
    const lookup = await fetchCommenterContext(user.id);
    commenter = lookup.context;
    const mode = lookup.replyLanguageMode;
    if (mode === "user" && lookup.contentLocale) {
      language = lookup.contentLocale.trim().toLowerCase();
      matchPostLanguage = false;
    } else if (/^[a-z]{2}$/.test(mode)) {
      language = mode;
      matchPostLanguage = false;
    } else {
      // "post" : on suit la langue du post. `language` reste comme
      // fallback (utilisé seulement si le post n'a pas de texte).
      matchPostLanguage = true;
    }
  } catch (err) {
    console.warn("[ai-suggest] fetchCommenterContext failed, fallback generic", err);
  }

  // Vision : on récupère l'image SURTOUT quand le texte seul est faible
  // (réseaux visuels FB/IG, peu/pas de légende). Best-effort, ne bloque
  // jamais : si l'image échoue, on génère en texte seul. Sur LinkedIn
  // (texte riche), on évite l'image pour rester rapide et économe sauf
  // si le post n'a quasiment pas de texte.
  let image: { media_type: string; data: string } | null = null;
  const thinText = !excerpt || excerpt.length < 220;
  const wantImage = !!body.image_url && (network !== "linkedin" || thinText);
  if (wantImage && body.image_url) {
    image = await fetchPostImage(body.image_url);
  }

  const suggestions = await generateSuggestions({
    contentExcerpt: excerpt,
    language,
    commenter,
    indications,
    matchPostLanguage,
    network,
    image,
  });

  return NextResponse.json({ ok: true, suggestions });
}
