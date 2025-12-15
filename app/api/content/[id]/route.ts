// app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

type PatchBody = Partial<{
  title: string;
  content: string;
  prompt: string;
  type: string;
  status: 'draft' | 'planned' | 'published' | 'archived' | string;
  scheduledDate: string | null; // YYYY-MM-DD
  channel: string;
  tags: string[];
}>;

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === 'string')
    .map((x) => (x as string).trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params as any);
    const id = safeString(params?.id);

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('content_item')
      .select(
        'id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at'
      )
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params as any);
    const id = safeString(params?.id);

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;

    const patch: Record<string, unknown> = {};

    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200);
    if (typeof body.content === 'string') patch.content = body.content;
    if (typeof body.prompt === 'string') patch.prompt = body.prompt;
    if (typeof body.type === 'string') patch.type = body.type.trim().slice(0, 50);
    if (typeof body.status === 'string') patch.status = body.status.trim().slice(0, 30);
    if (typeof body.channel === 'string') patch.channel = body.channel.trim().slice(0, 50);
    if (body.scheduledDate === null || typeof body.scheduledDate === 'string') {
      patch.scheduled_date = body.scheduledDate;
    }
    if (Array.isArray(body.tags)) patch.tags = safeStringArray(body.tags);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('content_item')
      .update(patch)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select(
        'id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at'
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params as any);
    const id = safeString(params?.id);

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const { error } = await supabase
      .from('content_item')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
