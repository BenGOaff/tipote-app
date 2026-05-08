// POST /api/compta/connections/disconnect
//
// Route générique pour déconnecter n'importe quel PSP (Stripe, PayPal,
// Mollie quand il sera là). Soft-delete via disabled_at — l'historique
// des transactions importées reste consultable. Reconnecter le même
// provider plus tard restaure la même ligne.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const Body = z.object({
  connectionId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("payment_connections")
    .update({
      disabled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.connectionId)
    .eq("user_id", user.id); // double check ownership

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
