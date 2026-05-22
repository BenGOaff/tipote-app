// app/llms.txt/route.ts — Tipote (mirror Tiquiz).
// Cf. https://llmstxt.org

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";
export const revalidate = 3600;

export async function GET() {
  const h = await headers();
  const customHost = h.get(CUSTOM_HOST_HEADER);
  const body = customHost
    ? await buildCustomDomainLlmsTxt(customHost.toLowerCase().trim())
    : await buildMainHostLlmsTxt();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

async function buildCustomDomainLlmsTxt(host: string): Promise<string> {
  const { data: cd } = await supabaseAdmin
    .from("custom_domains")
    .select("user_id, project_id")
    .ilike("hostname", host)
    .eq("status", "verified")
    .maybeSingle();
  const row = cd as { user_id?: string; project_id?: string | null } | null;
  if (!row?.user_id) return `# ${host}\n\nNo content available for this domain.\n`;

  const [bizRes, quizzesRes] = await Promise.all([
    row.project_id
      ? supabaseAdmin
          .from("business_profiles")
          .select("share_site_name, target_audience, brand_website_url")
          .eq("user_id", row.user_id)
          .eq("project_id", row.project_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (() => {
      let q = supabaseAdmin
        .from("quizzes")
        .select("slug, id, title, og_description, introduction, content_locale, updated_at")
        .eq("user_id", row.user_id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (row.project_id) q = q.eq("project_id", row.project_id);
      return q;
    })(),
  ]);

  const biz = bizRes.data as
    | { share_site_name?: string | null; target_audience?: string | null; brand_website_url?: string | null }
    | null;
  const quizzes = (quizzesRes.data ?? []) as Array<{
    slug: string | null;
    id: string;
    title: string;
    og_description: string | null;
    introduction: string | null;
    content_locale: string | null;
    updated_at: string;
  }>;

  const base = `https://${host}`;
  const siteName = biz?.share_site_name?.trim() || host;

  const lines: string[] = [];
  lines.push(`# ${siteName}`);
  lines.push("");
  if (biz?.target_audience?.trim()) {
    lines.push(`> ${biz.target_audience.trim()}`);
    lines.push("");
  }
  lines.push("Interactive content designed to help visitors discover insights and engage with this author's expertise.");
  lines.push("");

  if (quizzes.length > 0) {
    lines.push("## Quizzes");
    lines.push("");
    for (const q of quizzes) {
      const title = stripHtml(q.title).trim() || "Untitled";
      const desc = stripHtml(q.og_description || q.introduction || "").slice(0, 200).trim();
      const url = q.slug ? `${base}/${q.slug}` : `${base}/q/${q.id}`;
      lines.push(`- [${title}](${url})${desc ? `: ${desc}` : ""}`);
    }
    lines.push("");
  }

  if (biz?.brand_website_url) {
    lines.push("## Author website");
    lines.push("");
    lines.push(`- [${siteName}](${biz.brand_website_url})`);
    lines.push("");
  }

  return lines.join("\n");
}

async function buildMainHostLlmsTxt(): Promise<string> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://app.tipote.com").replace(/\/$/, "");
  const lines: string[] = [];
  lines.push("# Tipote");
  lines.push("");
  lines.push("> An all-in-one platform for creators to build interactive content (quizzes, popquizzes, hosted pages) and grow their audience.");
  lines.push("");
  lines.push("Tipote helps coaches, photographers, educators and content creators turn their expertise into interactive funnels that capture leads and convert.");
  lines.push("");

  try {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("slug, id, title, og_description")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(50);
    const quizzes = (data ?? []) as Array<{ slug: string | null; id: string; title: string; og_description: string | null }>;
    if (quizzes.length > 0) {
      lines.push("## Featured quizzes");
      lines.push("");
      for (const q of quizzes) {
        const title = stripHtml(q.title).trim() || "Untitled";
        const desc = stripHtml(q.og_description || "").slice(0, 160).trim();
        const url = `${base}/q/${q.slug || q.id}`;
        lines.push(`- [${title}](${url})${desc ? `: ${desc}` : ""}`);
      }
      lines.push("");
    }
  } catch {
    // ignore
  }

  lines.push("## Resources");
  lines.push("");
  lines.push(`- [Homepage](${base}/)`);
  lines.push(`- [Privacy policy](${base}/legal/privacy)`);
  lines.push("");

  return lines.join("\n");
}
