// app/affiliate/api/auth/verify/route.ts
//
// Appelé par le callback après que Supabase a établi une session.
// Vérifie que l'email Supabase est bien un affilié actif. Si non,
// la callback signOut + redirect vers /login.

import { NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_affiliate" }, { status: 200 });
  }
  return NextResponse.json({ ok: true, sa: session.sa });
}
