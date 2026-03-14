// app/api/project-sources/route.ts
// Manage project-scoped context sources (text notes, PDF, DOCX).
// These sources are injected into ALL content generation prompts.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SOURCES_PER_PROJECT = 5;
const MAX_CONTENT_TEXT_CHARS = 10_000;

function safeString(v: unknown, maxLen = 500): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// --------------- GET: list sources for active project ---------------
export async function GET(_req: NextRequest) {
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

    let query = supabase
      .from("project_sources")
      .select("id, title, source_type, original_filename, file_size_bytes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, sources: data ?? [] });
  } catch (e: any) {
    console.error("[project-sources] GET error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// --------------- POST: add a source (text or file upload) ---------------
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

    // Check source count limit
    let countQuery = supabase
      .from("project_sources")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (projectId) {
      countQuery = countQuery.eq("project_id", projectId);
    } else {
      countQuery = countQuery.is("project_id", null);
    }

    const { count } = await countQuery;
    if ((count ?? 0) >= MAX_SOURCES_PER_PROJECT) {
      return NextResponse.json(
        { ok: false, error: `Maximum ${MAX_SOURCES_PER_PROJECT} sources par projet. Supprimez-en une pour en ajouter.` },
        { status: 400 },
      );
    }

    const contentType = req.headers.get("content-type") ?? "";

    // ---- Mode 1: JSON body (text source) ----
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const title = safeString(body.title, 200);
      const contentText = safeString(body.content_text, MAX_CONTENT_TEXT_CHARS);

      if (!title) {
        return NextResponse.json({ ok: false, error: "Le titre est requis." }, { status: 400 });
      }
      if (!contentText || contentText.length < 10) {
        return NextResponse.json({ ok: false, error: "Le contenu doit faire au moins 10 caractères." }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("project_sources")
        .insert({
          user_id: user.id,
          project_id: projectId ?? null,
          source_type: "text",
          title,
          content_text: contentText,
        })
        .select("id, title, source_type, original_filename, file_size_bytes, created_at")
        .single();

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, source: data }, { status: 201 });
    }

    // ---- Mode 2: FormData (file upload) ----
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = safeString(formData.get("title") as string, 200);

    if (!file) {
      return NextResponse.json({ ok: false, error: "Aucun fichier fourni." }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExts = ["txt", "pdf", "docx", "md"];
    if (!allowedExts.includes(ext ?? "")) {
      return NextResponse.json(
        { ok: false, error: "Format non supporté. Utilisez TXT, PDF, DOCX ou MD." },
        { status: 400 },
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Fichier trop volumineux (max 5 Mo)." },
        { status: 400 },
      );
    }

    // Extract text from file
    let textContent = "";
    const buffer = Buffer.from(await file.arrayBuffer());

    if (ext === "txt" || ext === "md") {
      textContent = buffer.toString("utf-8");
    } else if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        textContent = result.value;
      } catch {
        return NextResponse.json(
          { ok: false, error: "Erreur lors de la lecture du fichier Word." },
          { status: 400 },
        );
      }
    } else if (ext === "pdf") {
      textContent = buffer.toString("utf-8").replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, " ");
      const readableRatio = textContent.replace(/\s/g, "").length / Math.max(1, buffer.length);
      if (readableRatio < 0.1) {
        return NextResponse.json(
          { ok: false, error: "Le PDF ne contient pas de texte lisible. Essayez avec un format TXT ou DOCX." },
          { status: 400 },
        );
      }
    }

    if (!textContent.trim() || textContent.trim().length < 10) {
      return NextResponse.json(
        { ok: false, error: "Le fichier semble vide ou trop court." },
        { status: 400 },
      );
    }

    // Truncate to max
    if (textContent.length > MAX_CONTENT_TEXT_CHARS) {
      textContent = textContent.slice(0, MAX_CONTENT_TEXT_CHARS);
    }

    const sourceType = ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "text";
    const finalTitle = title || file.name.replace(/\.[^.]+$/, "");

    const { data, error } = await supabase
      .from("project_sources")
      .insert({
        user_id: user.id,
        project_id: projectId ?? null,
        source_type: sourceType,
        title: finalTitle,
        content_text: textContent.trim(),
        original_filename: file.name,
        file_size_bytes: file.size,
      })
      .select("id, title, source_type, original_filename, file_size_bytes, created_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, source: data }, { status: 201 });
  } catch (e: any) {
    console.error("[project-sources] POST error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
