// app/api/templates/schema/route.ts
// Returns the user-facing fields for a given template.
// Used by the adaptive FunnelConfigStep to render schema-driven inputs.

import { NextResponse } from "next/server";
import { inferTemplateSchema, getUserFacingFields } from "@/lib/templates/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: "capture" | "vente";
  templateId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const kind: "capture" | "vente" = body?.kind === "vente" ? "vente" : "capture";
    const templateId = String(body?.templateId ?? "").trim();

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "Missing templateId" },
        { status: 400 }
      );
    }

    const schema = await inferTemplateSchema({ kind, templateId });
    const userFields = getUserFacingFields(schema);

    return NextResponse.json({
      ok: true,
      schema: {
        kind: schema.kind,
        templateId: schema.templateId,
        name: schema.name || null,
        description: schema.description || null,
      },
      userFields,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}