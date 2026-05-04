// app/api/popquiz/route.ts
// CRUD entry point for popquizzes.
//   GET  — list current user's popquizzes (lightweight)
//   POST — atomic create: video row + popquiz row + cues
//
// Cue quiz_ids are validated against the caller's owned quizzes so
// nobody can attach someone else's quiz to their own popquiz.
// Slug is sanitized via the shared sanitizeSlug helper so slug
// validation stays consistent with the quiz codebase.
//
// Video source: either `url` (YouTube / Vimeo / direct .mp4) OR
// `uploaded_path` (raw object inside the popquiz-videos bucket,
// scoped to raw/<auth.uid>/...). Exactly one of the two must be
// provided. Uploads land as source='upload', status='ready' —
// the public play page mints a signed URL on demand for playback.
// `uploaded_thumbnail_path` and `uploaded_duration_ms` are
// optional companions to `uploaded_path` (extracted client-side).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { parseVideoUrl } from "@/lib/popquiz";
import { sanitizeSlug } from "@/lib/quizBranding";

export const dynamic = "force-dynamic";

interface CueInput {
  quiz_id: string;
  timestamp_ms: number;
  behavior: "block" | "optional";
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let listQuery = supabase
    .from("popquizzes")
    .select(
      `id, title, description, slug, locale, is_published,
       views_count, completions_count, created_at,
       video:popquiz_videos!inner(source, thumbnail_url, duration_ms, status)`,
    )
    .eq("user_id", user.id);
  if (projectId) listQuery = listQuery.eq("project_id", projectId);
  const { data, error } = await listQuery.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, popquizzes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "title is required" },
      { status: 400 },
    );
  }

  const url = String(body.url ?? "").trim();
  const uploadedPath =
    typeof body.uploaded_path === "string" ? body.uploaded_path.trim() : "";
  const uploadedThumbnailPath =
    typeof body.uploaded_thumbnail_path === "string"
      ? body.uploaded_thumbnail_path.trim()
      : "";
  const uploadedDurationMs =
    typeof body.uploaded_duration_ms === "number" &&
    Number.isFinite(body.uploaded_duration_ms) &&
    body.uploaded_duration_ms > 0
      ? Math.floor(body.uploaded_duration_ms)
      : null;

  let videoInsert: Record<string, unknown> | null = null;

  if (uploadedPath) {
    const expectedPrefix = `raw/${user.id}/`;
    if (!uploadedPath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { ok: false, error: "Invalid upload path" },
        { status: 400 },
      );
    }
    if (
      uploadedThumbnailPath &&
      !uploadedThumbnailPath.startsWith(expectedPrefix)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid thumbnail path" },
        { status: 400 },
      );
    }
    videoInsert = {
      user_id: user.id,
      source: "upload",
      storage_path: uploadedPath,
      thumbnail_path: uploadedThumbnailPath || null,
      duration_ms: uploadedDurationMs,
      // MVP: no transcoding pipeline yet, the browser plays the raw
      // file directly via a signed URL. status='ready' from day one.
      status: "ready",
    };
  } else if (url) {
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "Invalid or unsupported video URL" },
        { status: 400 },
      );
    }

    // Best-effort thumbnail derivation. YouTube exposes a deterministic
    // URL (no API call needed) ; Vimeo requires oEmbed. If oEmbed fails
    // (offline build, network hiccup, private video), we fall back to
    // null thumbnail — the player has its own poster fallback. Never
    // blocks creation.
    let thumbnailUrl: string | null = null;
    if (parsed.source === "youtube" && parsed.externalId) {
      thumbnailUrl = `https://i.ytimg.com/vi/${parsed.externalId}/hqdefault.jpg`;
    } else if (parsed.source === "vimeo" && parsed.externalId) {
      try {
        const oembed = await fetch(
          `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.normalizedUrl)}`,
          { signal: AbortSignal.timeout(3000) },
        );
        if (oembed.ok) {
          const data = (await oembed.json()) as { thumbnail_url?: string };
          thumbnailUrl = typeof data.thumbnail_url === "string" ? data.thumbnail_url : null;
        }
      } catch {
        // fail-open — null thumbnail is fine
      }
    }

    videoInsert = {
      user_id: user.id,
      source: parsed.source,
      external_url: parsed.normalizedUrl,
      external_id: parsed.externalId,
      thumbnail_url: thumbnailUrl,
      status: "ready",
    };
  } else {
    return NextResponse.json(
      { ok: false, error: "Précise une URL ou importe une vidéo." },
      { status: 400 },
    );
  }

  const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug = rawSlug.length > 0 ? sanitizeSlug(rawSlug) : null;
  if (rawSlug.length > 0 && slug === null) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Slug invalide. Lettres minuscules, chiffres et tirets uniquement (3 à 50 caractères).",
      },
      { status: 400 },
    );
  }

  const rawCues = Array.isArray(body.cues) ? body.cues : [];
  const cues: CueInput[] = [];
  for (const c of rawCues) {
    if (!c || typeof c !== "object") continue;
    const cue = c as Record<string, unknown>;
    const quiz_id = String(cue.quiz_id ?? "");
    const timestamp_ms = Number(cue.timestamp_ms);
    if (!quiz_id || !Number.isFinite(timestamp_ms) || timestamp_ms < 0) continue;
    cues.push({
      quiz_id,
      timestamp_ms: Math.floor(timestamp_ms),
      behavior: cue.behavior === "optional" ? "optional" : "block",
    });
  }

  if (cues.length > 0) {
    const ids = Array.from(new Set(cues.map((c) => c.quiz_id)));
    const { data: ownedQuizzes } = await supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", user.id)
      .in("id", ids);
    const owned = new Set((ownedQuizzes ?? []).map((q) => q.id));
    const missing = ids.filter((id) => !owned.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Quiz introuvable ou non possédé : ${missing.join(", ")}`,
        },
        { status: 400 },
      );
    }
  }

  const { data: video, error: videoError } = await supabase
    .from("popquiz_videos")
    .insert(videoInsert)
    .select("id")
    .single();

  if (videoError || !video) {
    return NextResponse.json(
      { ok: false, error: videoError?.message ?? "Failed to create video" },
      { status: 400 },
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  const { data: popquiz, error: popquizError } = await supabase
    .from("popquizzes")
    .insert({
      user_id: user.id,
      ...(projectId ? { project_id: projectId } : {}),
      video_id: video.id,
      title,
      slug,
      description: body.description ? String(body.description) : null,
      locale: typeof body.locale === "string" ? body.locale : "fr",
      is_published: body.is_published === true,
    })
    .select("id, slug")
    .single();

  if (popquizError || !popquiz) {
    await supabase.from("popquiz_videos").delete().eq("id", video.id);
    const isSlugConflict =
      popquizError?.message?.includes("uniq_popquizzes_slug") ||
      popquizError?.code === "23505";
    return NextResponse.json(
      {
        ok: false,
        error: isSlugConflict
          ? "Ce slug est déjà utilisé. Choisis-en un autre."
          : (popquizError?.message ?? "Failed to create popquiz"),
      },
      { status: 400 },
    );
  }

  if (cues.length > 0) {
    const { error: cuesError } = await supabase.from("popquiz_cues").insert(
      cues.map((c, i) => ({
        popquiz_id: popquiz.id,
        quiz_id: c.quiz_id,
        timestamp_ms: c.timestamp_ms,
        behavior: c.behavior,
        display_order: i,
      })),
    );
    if (cuesError) {
      await supabase.from("popquizzes").delete().eq("id", popquiz.id);
      await supabase.from("popquiz_videos").delete().eq("id", video.id);
      return NextResponse.json(
        { ok: false, error: cuesError.message },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    popquizId: popquiz.id,
    slug: popquiz.slug,
  });
}
