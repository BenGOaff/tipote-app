// PATCH  /api/client-templates/[id] — update template name/description/color/items + optional sync
// DELETE /api/client-templates/[id] — delete template

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ id: string }> };

type ItemInput = { id?: string; title: string };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Fetch old template for sync comparison
  const { data: oldTemplate } = await supabase
    .from("client_templates")
    .select("name, client_template_items(id, title, position)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!oldTemplate) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const oldName = oldTemplate.name;
  const oldItems: Array<{ id: string; title: string; position: number }> =
    ((oldTemplate as any).client_template_items ?? []).sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
    );

  // Update template fields
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.color !== undefined) updates.color = body.color;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("client_templates")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upsert items if provided (preserves UUIDs for existing items)
  let newItemIds: string[] = [];
  if (Array.isArray(body.items)) {
    const items: ItemInput[] = body.items.filter(
      (it: any) => typeof it === "object" && it !== null && typeof it.title === "string" && it.title.trim(),
    );

    const existingIds = items.filter((it) => it.id).map((it) => it.id!);

    // Delete items no longer in the list
    if (existingIds.length > 0) {
      await supabase
        .from("client_template_items")
        .delete()
        .eq("template_id", id)
        .not("id", "in", `(${existingIds.join(",")})`);
    } else {
      await supabase.from("client_template_items").delete().eq("template_id", id);
    }

    // Upsert each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.id) {
        await supabase
          .from("client_template_items")
          .update({ title: item.title.trim(), position: i })
          .eq("id", item.id);
        newItemIds.push(item.id);
      } else {
        const { data: inserted } = await supabase
          .from("client_template_items")
          .insert({ template_id: id, title: item.title.trim(), position: i })
          .select("id")
          .single();
        if (inserted) newItemIds.push(inserted.id);
      }
    }
  }

  // Sync to client processes if requested
  let syncedCount = 0;
  if (body.sync === true) {
    syncedCount = await syncProcesses({
      supabase,
      templateId: id,
      oldName,
      newName: body.name?.trim() ?? oldName,
      oldItems,
      newItemIds,
    });
  }

  // Re-fetch
  const { data: full } = await supabase
    .from("client_templates")
    .select("*, client_template_items(*)")
    .eq("id", id)
    .single();

  return NextResponse.json({ ok: true, template: full, synced: syncedCount });
}

async function syncProcesses(params: {
  supabase: any;
  templateId: string;
  oldName: string;
  newName: string;
  oldItems: Array<{ id: string; title: string; position: number }>;
  newItemIds: string[];
}): Promise<number> {
  const { supabase, templateId, oldName, newName, oldItems, newItemIds } = params;

  // Fetch all processes linked to this template
  const { data: processes } = await supabase
    .from("client_processes")
    .select("id, name")
    .eq("template_id", templateId);

  if (!processes || processes.length === 0) return 0;

  // Fetch new template items
  const { data: newTemplateItems } = await supabase
    .from("client_template_items")
    .select("id, title, position")
    .eq("template_id", templateId)
    .order("position", { ascending: true });

  const newItems: Array<{ id: string; title: string; position: number }> = newTemplateItems ?? [];

  // Build lookup for old items
  const oldItemMap = new Map(oldItems.map((it) => [it.id, it]));
  const newItemMap = new Map(newItems.map((it) => [it.id, it]));

  // Deleted template item IDs
  const deletedItemIds = oldItems.filter((it) => !newItemMap.has(it.id)).map((it) => it.id);
  // New template item IDs (not in old)
  const addedItems = newItems.filter((it) => !oldItemMap.has(it.id));
  // Updated template items (existed before and still exist)
  const updatedItems = newItems.filter((it) => oldItemMap.has(it.id));

  for (const proc of processes) {
    // Update process name if it still matches old template name
    if (proc.name === oldName && newName !== oldName) {
      await supabase
        .from("client_processes")
        .update({ name: newName })
        .eq("id", proc.id);
    }

    // Fetch process items
    const { data: processItems } = await supabase
      .from("client_process_items")
      .select("id, title, is_done, template_item_id, position")
      .eq("process_id", proc.id);

    if (!processItems) continue;

    // Handle deleted template items
    for (const pi of processItems) {
      if (pi.template_item_id && deletedItemIds.includes(pi.template_item_id)) {
        if (pi.is_done) {
          // Orphan it (preserve progress)
          await supabase
            .from("client_process_items")
            .update({ template_item_id: null })
            .eq("id", pi.id);
        } else {
          // Remove uncompleted step
          await supabase
            .from("client_process_items")
            .delete()
            .eq("id", pi.id);
        }
      }
    }

    // Handle updated template items (title change)
    for (const ti of updatedItems) {
      const oldTi = oldItemMap.get(ti.id);
      if (!oldTi || oldTi.title === ti.title) continue;

      // Find the process item linked to this template item
      const pi = processItems.find((p: any) => p.template_item_id === ti.id);
      if (!pi) continue;

      // Only update if the process item title still matches the old template title
      if (pi.title === oldTi.title) {
        await supabase
          .from("client_process_items")
          .update({ title: ti.title })
          .eq("id", pi.id);
      }
    }

    // Handle new template items — add to process
    if (addedItems.length > 0) {
      const maxPos = processItems.reduce((max: number, pi: any) => Math.max(max, pi.position ?? 0), -1);
      const newRows = addedItems.map((ti, idx) => ({
        process_id: proc.id,
        title: ti.title,
        position: maxPos + 1 + idx,
        template_item_id: ti.id,
        is_done: false,
      }));
      await supabase.from("client_process_items").insert(newRows);
    }
  }

  return processes.length;
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("client_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
