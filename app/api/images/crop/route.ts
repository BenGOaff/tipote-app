// app/api/images/crop/route.ts
// POST : recadre + réduit une image (couverture / résultat de quiz) côté serveur
// avec sharp, puis stocke le FICHIER FINAL optimisé dans le storage.
//
// Pourquoi serveur : sharp gère le recadrage ET le redimensionnement des GIF
// ANIMÉS sans perdre l'animation (extract/resize sont "page-aware" en 0.34, on
// l'a vérifié). On stocke le résultat → aucune nouvelle colonne DB, aucun
// changement du rendu visiteur (l'URL pointe déjà la bonne image).
//
// Body JSON :
//   { srcUrl, crop:{ x,y,w,h } (fractions 0..1 dans le repère d'UNE frame),
//     maxWidth?, contentId? }
// Retour : { ok:true, url, path }
//
// Anti-SSRF : on ne fetch que des hôtes autorisés (notre storage Supabase, le
// CDN studio, et KLIPY pour les GIFs). Tout autre hôte → 400.

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "content-images";
const MAX_BYTES = 25 * 1024 * 1024; // garde-fou sur l'image source
const MIN_W = 64;
const MAX_W = 1600;

// Hôtes autorisés pour la source (anti-SSRF). On y ajoute dynamiquement l'hôte
// du projet Supabase (storage public).
function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (/(^|\.)klipy\.com$/.test(h)) return true;        // GIFs KLIPY
  if (h === "cdn.tipote.app") return true;             // visuels studio
  try {
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (sb && h === new URL(sb).host) return true;      // storage Supabase
  } catch { /* ignore */ }
  return false;
}

type Fmt = "gif" | "png" | "jpeg" | "webp";
function pickFormat(metaFormat?: string): { fmt: Fmt; ext: string; type: string } {
  switch (metaFormat) {
    case "gif": return { fmt: "gif", ext: "gif", type: "image/gif" };
    case "jpeg":
    case "jpg": return { fmt: "jpeg", ext: "jpg", type: "image/jpeg" };
    case "webp": return { fmt: "webp", ext: "webp", type: "image/webp" };
    default: return { fmt: "png", ext: "png", type: "image/png" };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as
    | { srcUrl?: string; crop?: { x: number; y: number; w: number; h: number }; maxWidth?: number; contentId?: string }
    | null;
  if (!body?.srcUrl || !body.crop) {
    return NextResponse.json({ ok: false, error: "srcUrl and crop required" }, { status: 400 });
  }

  // Valide l'URL source + l'hôte (anti-SSRF).
  let src: URL;
  try {
    src = new URL(body.srcUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid srcUrl" }, { status: 400 });
  }
  if (src.protocol !== "https:" || !allowedHost(src.host)) {
    return NextResponse.json({ ok: false, error: "Source host not allowed" }, { status: 400 });
  }

  // Fetch source (avec cap de taille).
  let inputBuf: Buffer;
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Fetch failed" }, { status: 502 });
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) return NextResponse.json({ ok: false, error: "Source too large" }, { status: 413 });
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return NextResponse.json({ ok: false, error: "Source too large" }, { status: 413 });
    inputBuf = Buffer.from(ab);
  } catch {
    return NextResponse.json({ ok: false, error: "Fetch error" }, { status: 502 });
  }

  try {
    const meta = await sharp(inputBuf, { animated: true }).metadata();
    const fullW = meta.width ?? 0;
    // Pour un animé, height = pageHeight*pages ; on travaille dans le repère d'UNE frame.
    const frameH = meta.pageHeight ?? meta.height ?? 0;
    if (!fullW || !frameH) {
      return NextResponse.json({ ok: false, error: "Unreadable image" }, { status: 422 });
    }

    // Normalise + clamp le rectangle de crop (fractions → pixels d'une frame).
    const cx = Math.min(Math.max(body.crop.x, 0), 1);
    const cy = Math.min(Math.max(body.crop.y, 0), 1);
    const cw = Math.min(Math.max(body.crop.w, 0.02), 1 - cx);
    const ch = Math.min(Math.max(body.crop.h, 0.02), 1 - cy);
    const left = Math.round(cx * fullW);
    const top = Math.round(cy * frameH);
    const width = Math.max(1, Math.min(Math.round(cw * fullW), fullW - left));
    const height = Math.max(1, Math.min(Math.round(ch * frameH), frameH - top));

    let pipeline = sharp(inputBuf, { animated: true }).extract({ left, top, width, height });

    // Réduction : largeur cible (clampée), sans agrandir.
    const target = body.maxWidth
      ? Math.min(MAX_W, Math.max(MIN_W, Math.round(body.maxWidth)))
      : 0;
    if (target && target < width) {
      pipeline = pipeline.resize({ width: target });
    }

    const { fmt, ext, type } = pickFormat(meta.format);
    const outBuf =
      fmt === "gif" ? await pipeline.gif().toBuffer()
      : fmt === "jpeg" ? await pipeline.jpeg({ quality: 85 }).toBuffer()
      : fmt === "webp" ? await pipeline.webp({ quality: 85 }).toBuffer()
      : await pipeline.png().toBuffer();

    const contentId = (body.contentId || "cropped").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const path = `${user.id}/${contentId}/${Date.now()}-crop.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, outBuf, {
      contentType: type,
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: urlData.publicUrl, path });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Processing error" },
      { status: 500 },
    );
  }
}
