// app/sitemap.ts — host-aware.
//
// Dispatch sur l'en-tête `x-tipote-custom-host` que pose le middleware
// quand la requête vient d'un domaine personnalisé d'un user (custom
// domain Pro). Scope par (user_id, project_id) car Tipote est
// multi-projet.
//
// `revalidate = 3600` → régen 1h.

import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const customHost = h.get(CUSTOM_HOST_HEADER);

  if (customHost) {
    return buildCustomDomainSitemap(customHost.toLowerCase().trim());
  }
  return buildMainHostSitemap();
}

async function buildCustomDomainSitemap(host: string): Promise<MetadataRoute.Sitemap> {
  const { data: cd } = await supabaseAdmin
    .from("custom_domains")
    .select("user_id, project_id")
    .ilike("hostname", host)
    .eq("status", "verified")
    .maybeSingle();
  const row = cd as { user_id?: string; project_id?: string | null } | null;
  if (!row?.user_id) return [];

  const base = `https://${host}`;
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 1 },
  ];

  // Quizzes
  try {
    let q = supabaseAdmin
      .from("quizzes")
      .select("id, slug, updated_at, project_id")
      .eq("user_id", row.user_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(8000);
    if (row.project_id) q = q.eq("project_id", row.project_id);
    const { data } = await q;
    for (const item of (data ?? []) as Array<{ id: string; slug: string | null; updated_at: string }>) {
      entries.push({
        url: item.slug ? `${base}/${item.slug}` : `${base}/q/${item.id}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      });
    }
  } catch (err) {
    console.warn("[sitemap/custom-domain] quizzes fetch error", err);
  }

  // Popquizzes
  try {
    let q = supabaseAdmin
      .from("popquizzes")
      .select("id, slug, updated_at, project_id")
      .eq("user_id", row.user_id)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (row.project_id) q = q.eq("project_id", row.project_id);
    const { data } = await q;
    for (const item of (data ?? []) as Array<{ id: string; slug: string | null; updated_at: string }>) {
      entries.push({
        url: item.slug ? `${base}/${item.slug}` : `${base}/pq/${item.id}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      });
    }
  } catch (err) {
    console.warn("[sitemap/custom-domain] popquizzes fetch error", err);
  }

  return entries;
}

async function buildMainHostSitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://app.tipote.com").replace(/\/$/, "");

  const staticRoutes = ["", "/legal/extension", "/legal/privacy", "/legal/mentions"];
  const entries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${base}${route || "/"}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1 : 0.4,
  }));

  try {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("id, slug, updated_at, status")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(8000);
    for (const item of (data ?? []) as Array<{ id: string; slug: string | null; updated_at: string }>) {
      entries.push({
        url: `${base}/q/${item.slug || item.id}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      });
    }
  } catch (err) {
    console.warn("[sitemap/main] quizzes fetch error", err);
  }

  try {
    const { data } = await supabaseAdmin
      .from("popquizzes")
      .select("id, slug, updated_at, is_published")
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(2000);
    for (const item of (data ?? []) as Array<{ id: string; slug: string | null; updated_at: string }>) {
      entries.push({
        url: `${base}/pq/${item.slug || item.id}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      });
    }
  } catch (err) {
    console.warn("[sitemap/main] popquizzes fetch error", err);
  }

  return entries;
}
