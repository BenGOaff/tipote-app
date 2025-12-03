// app/api/blocks/route.ts
// Rôle : API pour lister et créer des "business blocks" pour l'utilisateur connecté.

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type BusinessBlock = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('business_blocks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/blocks] Supabase error', error);
      return NextResponse.json(
        { error: 'Failed to fetch blocks' },
        { status: 500 },
      );
    }

    return NextResponse.json({ blocks: (data ?? []) as BusinessBlock[] });
  } catch (err) {
    console.error('[GET /api/blocks] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json().catch(() => null) as
      | { title?: string; description?: string; status?: string; priority?: number }
      | null;

    if (!body || !body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "title"' },
        { status: 400 },
      );
    }

    const title = body.title.trim();
    const description =
      body.description && typeof body.description === 'string'
        ? body.description.trim()
        : null;
    const status =
      body.status && typeof body.status === 'string' && body.status.trim() !== ''
        ? body.status.trim()
        : 'idea';

    let priority = 3;
    if (
      body.priority !== undefined &&
      Number.isFinite(body.priority) &&
      body.priority >= 1 &&
      body.priority <= 5
    ) {
      priority = Math.floor(body.priority);
    }

    if (title === '') {
      return NextResponse.json(
        { error: 'Title cannot be empty' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('business_blocks')
      .insert({
        user_id: userId,
        title,
        description,
        status,
        priority,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[POST /api/blocks] Supabase insert error', error);
      return NextResponse.json(
        { error: 'Failed to create block' },
        { status: 500 },
      );
    }

    return NextResponse.json({ block: data as BusinessBlock }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/blocks] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}
