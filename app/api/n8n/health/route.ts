// app/api/n8n/health/route.ts
// Simple health-check endpoint for n8n to verify connectivity.
// GET /api/n8n/health → { ok: true, app_url: "..." }

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? "NOT SET",
    timestamp: new Date().toISOString(),
  });
}
