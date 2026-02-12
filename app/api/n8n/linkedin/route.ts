import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/n8n/linkedin" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("linkedin_post"); // <-- IMPORTANT: on s'aligne sur ton header n8n
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json();
  return NextResponse.json({ ok: true, received: payload }, { status: 200 });
}
