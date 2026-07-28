// app/api/partner/auto-link/route.ts
// Auto-connexion par email : si un compte Tipote existe pour cet email,
// on cree directement un token de connexion (consentement implicite : meme
// personne, meme email, ecosysteme Bene). Sinon { ok:false, found:false }.
// Authentifie par le secret partage app-a-app. Miroir du pont Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomSecret, hashSecret, safeEqual } from "@/lib/partner/tokens";

export const dynamic = "force-dynamic";

const SHARED = (process.env.PARTNER_SHARED_SECRET ?? "").trim();

async function findUserIdByEmail(email: string): Promise<string | null> {
  const lower = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>;
    const found = users.find((u) => (u.email ?? "").toLowerCase() === lower);
    if (found) return found.id;
    if (users.length < perPage) return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!SHARED || !safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ ok: false, reason: "no_email" }, { status: 400 });

  const userId = await findUserIdByEmail(email);
  if (!userId) return NextResponse.json({ ok: true, found: false });

  const token = randomSecret();
  const { error } = await supabaseAdmin.from("partner_connections").insert({
    token_hash: hashSecret(token),
    user_id: userId,
    partner: "formaquiz",
  });
  if (error) return NextResponse.json({ ok: false, reason: "db" }, { status: 500 });

  return NextResponse.json({ ok: true, found: true, token, user_id: userId, email });
}
