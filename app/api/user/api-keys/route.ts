// app/api/user/api-keys/route.ts
// CRUD clés API utilisateur (chiffrées) — V1
// - GET ?provider=openai|claude|gemini
// - POST { provider, apiKey }
// - DELETE { provider }
// Auth Supabase obligatoire
//
// Invariants UI (Settings):
// - GET renvoie: configured (encryption OK), provider, hasKey, masked
// - POST refuse si TIPOTE_KEYS_ENCRYPTION_KEY manquante (sécurité / cohérence)
// - Validation provider stricte (400 si invalide)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  deleteUserApiKey,
  getDecryptedUserApiKey,
  upsertUserApiKey,
  type Provider,
} from "@/lib/userApiKeys";

function asProvider(v: unknown): Provider | null {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "openai" || s === "claude" || s === "gemini") return s;
  return null;
}

function maskKey(k: string) {
  const s = String(k ?? "").trim();
  if (!s) return "••••••••";
  if (s.length <= 10) return "••••••••";
  return `${s.slice(0, 3)}••••••••${s.slice(-4)}`;
}

export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const provider = asProvider(url.searchParams.get("provider"));

    if (!provider) {
      return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 });
    }

    // Indique si le chiffrement est configuré (sinon on désactive côté UI)
    const configured = Boolean(process.env.TIPOTE_KEYS_ENCRYPTION_KEY);

    const key = configured
      ? await getDecryptedUserApiKey({
          supabase,
          userId: session.user.id,
          provider,
        })
      : null;

    return NextResponse.json(
      {
        ok: true,
        configured, // encryption configured
        provider,
        hasKey: Boolean(key),
        masked: key ? maskKey(key) : null,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.TIPOTE_KEYS_ENCRYPTION_KEY) {
      return NextResponse.json(
        { ok: false, error: "Encryption not configured (TIPOTE_KEYS_ENCRYPTION_KEY missing)" },
        { status: 501 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const provider = asProvider((body as any)?.provider);
    const apiKey = String((body as any)?.apiKey ?? "").trim();

    if (!provider) {
      return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 });
    }
    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json({ ok: false, error: "Invalid apiKey" }, { status: 400 });
    }

    const res = await upsertUserApiKey({
      supabase,
      userId: session.user.id,
      provider,
      apiKey,
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error ?? "Save failed" }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true, configured: true, provider, hasKey: true, masked: maskKey(apiKey) },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const provider = asProvider((body as any)?.provider);
    if (!provider) {
      return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 });
    }

    const res = await deleteUserApiKey({
      supabase,
      userId: session.user.id,
      provider,
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error ?? "Delete failed" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
