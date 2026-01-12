import { NextResponse } from "next/server";

// Alias legacy -> endpoint réel
export async function POST(req: Request) {
  try {
    const body = await req.text();

    const res = await fetch(new URL("/api/content/generate", req.url), {
      method: "POST",
      headers: {
        "Content-Type": req.headers.get("content-type") ?? "application/json",
        // forward cookies so auth/session works server-side
        cookie: req.headers.get("cookie") ?? "",
      },
      body,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
