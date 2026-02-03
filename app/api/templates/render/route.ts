// app/api/templates/render/route.ts
// Render a template (preview or Systeme kit) as a standalone HTML document.
// Auth: requires Supabase session (server) to prevent public abuse.
// NOTE: does not create any content_item, only returns rendered HTML.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  renderTemplateHtml,
  type TemplateKind,
  type RenderMode,
} from "@/lib/templates/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind: TemplateKind;
  templateId: string;
  mode: RenderMode;
  variantId?: string | null;
  contentData: Record<string, unknown>;
  brandTokens?: Record<string, unknown> | null;
};

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = null;
  }

  const kind = (body?.kind || "capture") as TemplateKind;
  const templateId =
    typeof body?.templateId === "string" ? body!.templateId : "";
  const mode = (body?.mode || "preview") as RenderMode;
  const variantId = typeof body?.variantId === "string" ? body!.variantId : null;

  const contentData =
    body?.contentData && typeof body.contentData === "object"
      ? body.contentData
      : {};

  try {
    const { html } = await renderTemplateHtml({
      kind,
      templateId,
      mode,
      variantId,
      contentData,
      brandTokens:
        body?.brandTokens && typeof body.brandTokens === "object"
          ? (body.brandTokens as any)
          : null,
    });

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Render failed" },
      { status: 500 }
    );
  }
}
