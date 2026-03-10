// app/api/support/ticket/route.ts
// Public endpoint — creates a support ticket from chatbot escalation
// No auth required. Rate-limited by IP.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().max(100).optional(),
  subject: z.string().trim().max(200).optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(30),
  locale: z.enum(["fr", "en", "es", "it", "ar"]).optional(),
});

// Simple rate limit: 3 tickets / hour per IP
const ticketRateMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ticketRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ticketRateMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return false;
  }
  entry.count++;
  return entry.count > 3;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many tickets. Please wait." },
      { status: 429 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { email, name, subject, conversation, locale = "fr" } = parsed.data;

  try {
    const { data, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        email,
        name: name || null,
        subject: subject || null,
        conversation,
        locale,
        status: "open",
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, ticketId: data.id });
  } catch (err: any) {
    console.error("[support-ticket] Error:", err.message);
    return NextResponse.json(
      { ok: false, error: "Failed to create ticket" },
      { status: 500 },
    );
  }
}
