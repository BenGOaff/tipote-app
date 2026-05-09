// Server-only data access for popquizzes. Centralised so routes
// and pages share the same hydrated `Popquiz` shape (video + theme
// + cues + branding), and so the relationship-select syntax lives
// in one place if Supabase ever changes it.
//
// Uploads: when a popquiz's video is source='upload', we mint a
// short-lived signed URL on the fly for both the source file and
// (if present) its auto-extracted thumbnail. Player never has to
// know about the bucket layout. Signed URL TTL is 2 h — long
// enough for a typical viewing session, short enough that an
// outdated bookmark won't keep an unauthorised viewer streaming
// forever.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSelfHostedPath, signedPlaybackUrl } from "./playback";
import type {
  CueBehavior,
  Popquiz,
  PopquizBranding,
  PopquizCue,
  PopquizTheme,
  PopquizVideo,
  VideoSource,
  VideoStatus,
} from "./types";

interface VideoRow {
  id: string;
  source: string;
  external_url: string | null;
  external_id: string | null;
  storage_path: string | null;
  hls_path: string | null;
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  duration_ms: number | null;
  status: string;
}

interface ThemeRow {
  id: string;
  name: string;
  config: unknown;
  is_preset: boolean;
  is_shared: boolean;
}

interface CueRow {
  id: string;
  quiz_id: string;
  timestamp_ms: number;
  behavior: string;
  display_order: number;
}

interface PopquizRow {
  id: string;
  user_id: string | null;
  slug: string | null;
  title: string;
  description: string | null;
  locale: string;
  is_published: boolean;
  display_title?: string | null;
  display_subtitle?: string | null;
  bg_style?: string | null;
  bg_color?: string | null;
  bg_color_2?: string | null;
  border_width?: number | null;
  border_color?: string | null;
  shadow_intensity?: string | null;
  play_button_color?: string | null;
  play_button_shape?: string | null;
  show_creator_branding?: boolean | null;
  video: VideoRow | VideoRow[] | null;
  theme: ThemeRow | ThemeRow[] | null;
  cues: CueRow[];
}

interface ProfileBrandRow {
  brand_logo_url: string | null;
  brand_color_primary: string | null;
  brand_website_url: string | null;
}

interface AffiliateRow {
  tipote_affiliate_id: string | null;
}

const FULL_SELECT = `
  id,
  user_id,
  slug,
  title,
  description,
  locale,
  is_published,
  display_title,
  display_subtitle,
  bg_style,
  bg_color,
  bg_color_2,
  border_width,
  border_color,
  shadow_intensity,
  play_button_color,
  play_button_shape,
  show_creator_branding,
  video:popquiz_videos!inner(
    id, source, external_url, external_id,
    storage_path, hls_path, thumbnail_url, thumbnail_path,
    duration_ms, status
  ),
  theme:popquiz_themes(
    id, name, config, is_preset, is_shared
  ),
  cues:popquiz_cues(
    id, quiz_id, timestamp_ms, behavior, display_order
  )
`;

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 2; // 2 hours

function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapVideo(row: VideoRow): PopquizVideo {
  return {
    id: row.id,
    source: row.source as VideoSource,
    externalUrl: row.external_url,
    externalId: row.external_id,
    storagePath: row.storage_path,
    hlsPath: row.hls_path,
    thumbnailUrl: row.thumbnail_url,
    durationMs: row.duration_ms,
    status: row.status as VideoStatus,
  };
}

function mapTheme(row: ThemeRow | null): PopquizTheme | null {
  if (!row) return null;
  const cfg =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, string>)
      : {};
  return {
    id: row.id,
    name: row.name,
    config: cfg,
    isPreset: row.is_preset,
    isShared: row.is_shared,
  };
}

function mapCue(row: CueRow): PopquizCue {
  return {
    id: row.id,
    quizId: row.quiz_id,
    timestampMs: row.timestamp_ms,
    behavior: row.behavior as CueBehavior,
    displayOrder: row.display_order,
  };
}

function mapBranding(
  profile: ProfileBrandRow | null,
  affiliateId: string | null,
): PopquizBranding {
  return {
    logoUrl: profile?.brand_logo_url?.trim() || null,
    websiteUrl: profile?.brand_website_url?.trim() || null,
    primaryColor: profile?.brand_color_primary?.trim() || null,
    tipoteAffiliateId: affiliateId?.trim() || null,
  };
}

function applyBrandingToTheme(
  popquiz: Popquiz,
  branding: PopquizBranding,
): Popquiz {
  if (!branding.primaryColor) return popquiz;
  const cfg = popquiz.theme?.config ?? {};
  return {
    ...popquiz,
    theme: {
      id: popquiz.theme?.id ?? "brand-fallback",
      name: popquiz.theme?.name ?? "Brand",
      isPreset: false,
      isShared: false,
      config: { ...cfg, accent: branding.primaryColor },
    },
  };
}

// For source='upload' videos, mint a short-lived URL for the source
// file and (when present) the auto-extracted thumbnail.
//
// Two backends coexist while we migrate off Supabase Storage:
//   - new pipeline: storage_path starts with "<app>/" → nginx
//     secure_link URL (self-hosted /srv/popquiz-videos)
//   - legacy: storage_path starts with "raw/" → Supabase signed URL
// The check is purely path-based, so no DB migration is needed.
async function attachUploadSignedUrls(
  popquiz: Popquiz,
  storedThumbnailPath: string | null,
): Promise<Popquiz> {
  const v = popquiz.video;

  // Custom thumbnail signing : si l'user a uploadé une vignette
  // perso, on la signe — peu importe la source de la vidéo (YouTube,
  // Vimeo, URL ou upload). Sinon on retombe sur la vignette par
  // défaut (poster YouTube/Vimeo public ou auto-extracted upload).
  const signedThumb = storedThumbnailPath
    ? await mintPlaybackUrl(storedThumbnailPath)
    : v.thumbnailUrl;

  // Pour les vidéos uploadées, on signe aussi la source vidéo
  // (storagePath → secure_link nginx ou Supabase signed URL).
  if (v.source === "upload") {
    const signedSrc = v.storagePath
      ? await mintPlaybackUrl(v.storagePath)
      : v.externalUrl;
    return {
      ...popquiz,
      video: { ...v, externalUrl: signedSrc, thumbnailUrl: signedThumb },
    };
  }

  // YouTube / Vimeo / URL : la source vidéo reste telle quelle
  // (publique, gérée par le player Vidstack), seule la vignette
  // peut nécessiter une URL signée si elle est custom.
  return {
    ...popquiz,
    video: { ...v, thumbnailUrl: signedThumb },
  };
}

async function mintPlaybackUrl(storagePath: string): Promise<string | null> {
  if (isSelfHostedPath(storagePath)) {
    try {
      return signedPlaybackUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    } catch (e) {
      console.error("[popquiz] secure_link signing failed:", e);
      return null;
    }
  }
  const { data } = await supabaseAdmin.storage
    .from("popquiz-videos")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

function rowToPopquiz(
  row: PopquizRow,
  branding: PopquizBranding,
): { popquiz: Popquiz | null; thumbnailPath: string | null } {
  const video = firstOrSelf(row.video);
  if (!video) return { popquiz: null, thumbnailPath: null };
  const popquiz: Popquiz = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    locale: row.locale,
    isPublished: row.is_published,
    video: mapVideo(video),
    theme: mapTheme(firstOrSelf(row.theme)),
    branding,
    appearance: {
      displayTitle: row.display_title?.trim() || null,
      displaySubtitle: row.display_subtitle?.trim() || null,
      bgStyle:
        row.bg_style === "solid" || row.bg_style === "gradient"
          ? row.bg_style
          : "transparent",
      bgColor: row.bg_color?.trim() || null,
      bgColor2: row.bg_color_2?.trim() || null,
      borderWidth: typeof row.border_width === "number" ? row.border_width : 0,
      borderColor: row.border_color?.trim() || null,
      shadowIntensity:
        row.shadow_intensity === "soft" ||
        row.shadow_intensity === "medium" ||
        row.shadow_intensity === "strong"
          ? row.shadow_intensity
          : "none",
      playButtonColor: row.play_button_color?.trim() || null,
      playButtonShape:
        row.play_button_shape === "rounded" || row.play_button_shape === "square"
          ? row.play_button_shape
          : "circle",
      showCreatorBranding: row.show_creator_branding !== false,
    },
    cues: row.cues.map(mapCue).sort((a, b) => a.timestampMs - b.timestampMs),
  };
  return {
    popquiz: applyBrandingToTheme(popquiz, branding),
    // thumbnail_path lives on the video row but isn't part of the
    // exposed Popquiz shape — we use it only to mint a signed URL
    // before returning.
    thumbnailPath: video.thumbnail_path ?? null,
  };
}

async function fetchOwnerBranding(
  userId: string | null,
): Promise<PopquizBranding> {
  if (!userId) return mapBranding(null, null);
  // Branding (logo / couleur / site) vit sur `profiles` ; l'ID
  // affilié Tipote vit sur `business_profiles` (à côté de la clé
  // SIO). On fait les 2 requêtes en // pour ne pas allonger le TTFB
  // de la page publique. Pour les users multi-projets, on prend la
  // première ligne business_profiles avec un affiliate_id non-null —
  // si l'user en a configuré plusieurs différents on respecte celui
  // qui sort en premier (généralement le projet par défaut).
  const [{ data: profile }, { data: bp }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("brand_logo_url, brand_color_primary, brand_website_url")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("business_profiles")
      .select("tipote_affiliate_id")
      .eq("user_id", userId)
      .not("tipote_affiliate_id", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);
  return mapBranding(
    (profile as ProfileBrandRow | null) ?? null,
    (bp as AffiliateRow | null)?.tipote_affiliate_id ?? null,
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchPublishedPopquiz(
  popquizIdOrSlug: string,
): Promise<Popquiz | null> {
  let row: PopquizRow | null = null;

  if (UUID_RE.test(popquizIdOrSlug)) {
    const { data } = await supabaseAdmin
      .from("popquizzes")
      .select(FULL_SELECT)
      .eq("id", popquizIdOrSlug)
      .eq("is_published", true)
      .maybeSingle();
    row = (data as unknown as PopquizRow) ?? null;
  }

  if (!row) {
    const { data } = await supabaseAdmin
      .from("popquizzes")
      .select(FULL_SELECT)
      .eq("slug", popquizIdOrSlug)
      .eq("is_published", true)
      .maybeSingle();
    row = (data as unknown as PopquizRow) ?? null;
  }

  if (!row) return null;
  const branding = await fetchOwnerBranding(row.user_id);
  const { popquiz, thumbnailPath } = rowToPopquiz(row, branding);
  if (!popquiz) return null;
  return attachUploadSignedUrls(popquiz, thumbnailPath);
}

export async function fetchOwnedPopquiz(
  supabase: SupabaseClient,
  popquizId: string,
): Promise<Popquiz | null> {
  const { data, error } = await supabase
    .from("popquizzes")
    .select(FULL_SELECT)
    .eq("id", popquizId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as PopquizRow;
  const branding = await fetchOwnerBranding(row.user_id);
  const { popquiz, thumbnailPath } = rowToPopquiz(row, branding);
  if (!popquiz) return null;
  return attachUploadSignedUrls(popquiz, thumbnailPath);
}
