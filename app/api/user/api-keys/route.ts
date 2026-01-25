import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Les clés API personnelles ont été supprimées. Tipote utilise désormais des clés owner." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Les clés API personnelles ont été supprimées. Tipote utilise désormais des clés owner." },
    { status: 410 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { ok: false, error: "Les clés API personnelles ont été supprimées. Tipote utilise désormais des clés owner." },
    { status: 410 },
  );
}
