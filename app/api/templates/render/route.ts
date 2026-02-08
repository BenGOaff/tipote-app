// app/api/templates/render/route.ts
import { NextResponse } from "next/server";
import { renderTemplateHtml } from "@/lib/templates/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: "capture" | "vente";
  templateId?: string;
  mode?: "preview" | "preview_kit" | "kit";
  variantId?: string | null;
  contentData?: Record<string, any> | null;
  brandTokens?: Record<string, any> | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const kind: "capture" | "vente" = body?.kind === "vente" ? "vente" : "capture";
    const templateId = String(body?.templateId ?? "").trim();

    // renderTemplateHtml n'accepte que "preview" | "kit"
    const mode: "preview" | "kit" =
      body?.mode === "kit" || body?.mode === "preview_kit" ? "kit" : "preview";

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "Missing templateId" },
        { status: 400 }
      );
    }

    const { html } = await renderTemplateHtml({
      kind,
      templateId,
      mode,
      variantId: body?.variantId ?? null,
      contentData: body?.contentData ?? {},
      brandTokens: body?.brandTokens ?? null,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
