// app/api/templates/render/route.ts
// Render endpoint — now uses the programmatic page builder instead of template files.
import { NextResponse } from "next/server";
import { buildPage } from "@/lib/pageBuilder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: "capture" | "vente" | "vitrine";
  templateId?: string;
  mode?: "preview" | "preview_kit" | "kit";
  variantId?: string | null;
  contentData?: Record<string, any> | null;
  brandTokens?: Record<string, any> | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const kind = body?.kind === "vente" ? "vente" : body?.kind === "vitrine" ? "vitrine" : "capture";
    const pageType = kind === "vente" ? "sales" : kind === "vitrine" ? "showcase" : "capture";

    const html = buildPage({
      pageType,
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
