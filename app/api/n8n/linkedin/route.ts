import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-tipote-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // On valide juste le tuyau pour l’instant
  // payload attendu (exemple):
  // { userId, action: "publish"|"schedule", text, scheduledAt?, timezone? }

  return NextResponse.json({ ok: true, received: payload }, { status: 200 });
}
