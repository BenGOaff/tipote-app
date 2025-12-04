// app/api/blocks/[id]/route.ts
// Rôle : API pour mettre à jour ou supprimer un block individuel.

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = params;

  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { title?: string; description?: string | null; status?: string; priority?: number }
      | null;

    if (!body) {
      return NextResponse.json(
        { error: 'Missing body' },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim() === '') {
        return NextResponse.json(
          { error: 'Invalid title' },
          { status: 400 },
        );
      }
      update.title = body.title.trim();
    }

    if (body.description !== undefined) {
      if (body.description === null) {
        update.description = null;
      } else if (typeof body.description === 'string') {
        update.description = body.description.trim();
      }
    }

    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || body.status.trim() === '') {
        return NextResponse.json(
          { error: 'Invalid status' },
          { status: 400 },
        );
      }
      update.status = body.status.trim();
    }

    if (body.priority !== undefined) {
      if (
        !Number.isFinite(body.priority) ||
        body.priority < 1 ||
        body.priority > 5
      ) {
        return NextResponse.json(
          { error: 'Invalid priority' },
          { status: 400 },
        );
      }
      update.priority = Math.floor(body.priority);
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('business_blocks')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[PATCH /api/blocks/[id]] Supabase update error', error);
      return NextResponse.json(
        { error: 'Failed to update block' },
        { status: 500 },
      );
    }

    return NextResponse.json({ block: data });
  } catch (err) {
    console.error('[PATCH /api/blocks/[id]] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = params;

  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { error } = await supabase
      .from('business_blocks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE /api/blocks/[id]] Supabase delete error', error);
      return NextResponse.json(
        { error: 'Failed to delete block' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/blocks/[id]] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}
