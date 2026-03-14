// POST /api/client-processes — apply a template to a client (create process + items)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.client_id) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  // Verify client ownership
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", body.client_id)
    .eq("user_id", user.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let processName = body.name?.trim() || "Processus";
  let templateItems: Array<{ title: string; position: number }> = [];

  // If template_id provided, fetch template + items
  if (body.template_id) {
    const { data: template } = await supabase
      .from("client_templates")
      .select("*, client_template_items(*)")
      .eq("id", body.template_id)
      .eq("user_id", user.id)
      .single();

    if (template) {
      processName = body.name?.trim() || template.name;
      templateItems = (template.client_template_items ?? [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((item: any, i: number) => ({
          title: item.title,
          position: i,
          template_item_id: item.id ?? null,
        }));
    }
  }

  // Create process
  const { data: process, error: procError } = await supabase
    .from("client_processes")
    .insert({
      client_id: body.client_id,
      template_id: body.template_id ?? null,
      name: processName,
      status: "in_progress",
      due_date: body.due_date ?? null,
      amount_total: body.amount_total ?? null,
      amount_collected: body.amount_collected ?? 0,
      payment_type: body.payment_type ?? "full",
      installments_count: body.installments_count ?? null,
    })
    .select()
    .single();

  if (procError) return NextResponse.json({ error: procError.message }, { status: 500 });

  // Create process items from template (or from custom items)
  const customItems: string[] = body.items ?? [];
  const itemRows =
    customItems.length > 0
      ? customItems.map((title: string, i: number) => ({
          process_id: process.id,
          title: title.trim(),
          position: i,
        }))
      : templateItems.map((item) => ({
          process_id: process.id,
          title: item.title,
          position: item.position,
          template_item_id: (item as any).template_item_id ?? null,
        }));

  if (itemRows.length > 0) {
    await supabase.from("client_process_items").insert(itemRows);
  }

  // Re-fetch with items
  const { data: full } = await supabase
    .from("client_processes")
    .select("*, client_process_items(*)")
    .eq("id", process.id)
    .single();

  return NextResponse.json({ ok: true, process: full ?? process });
}
