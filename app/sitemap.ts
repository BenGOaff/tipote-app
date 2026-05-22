// app/sitemap.ts
//
// Sitemap dynamique exposant tous les contenus publics indexables :
//   - quiz publiés (status='active'), avec leur slug ou id
//   - popquiz publiés (status='active' / draft=false)
//   - pages /p/<slug>
//
// Cap à 10000 entries pour rester sous la limite Google par-sitemap
// (50000 / 50MB). Au-delà, faudra splitter en sitemap-index.
//
// Régénéré automatiquement toutes les heures (revalidate) pour que les
// nouveaux contenus publiés soient découvrables par Google rapidement
// sans attendre le prochain deploy.

import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const revalidate = 3600; // 1h

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://app.tipote.com").replace(/\/$/, "");

  // ─── Pages statiques (landing, légales) ──────────────────────────
  const staticRoutes = ["", "/legal/extension", "/legal/privacy", "/legal/mentions"];
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${base}${route || "/"}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1 : 0.4,
  }));

  // ─── Quiz publiés ────────────────────────────────────────────────
  let quizEntries: MetadataRoute.Sitemap = [];
  try {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("id, slug, updated_at, status")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(8000);
    if (Array.isArray(data)) {
      quizEntries = (data as Array<{ id: string; slug: string | null; updated_at: string }>).map((q) => ({
        url: `${base}/q/${q.slug || q.id}`,
        lastModified: new Date(q.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }
  } catch (err) {
    console.warn("[sitemap] failed to fetch quizzes", err);
  }

  // ─── Popquiz publiés ─────────────────────────────────────────────
  let popquizEntries: MetadataRoute.Sitemap = [];
  try {
    const { data } = await supabaseAdmin
      .from("popquizzes")
      .select("id, slug, updated_at, is_published")
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (Array.isArray(data)) {
      popquizEntries = (data as Array<{ id: string; slug: string | null; updated_at: string }>).map((p) => ({
        url: `${base}/pq/${p.slug || p.id}`,
        lastModified: new Date(p.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }
  } catch (err) {
    console.warn("[sitemap] failed to fetch popquizzes", err);
  }

  return [...staticEntries, ...quizEntries, ...popquizEntries];
}
