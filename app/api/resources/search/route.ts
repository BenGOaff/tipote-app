// app/api/resources/search/route.ts
// Rôle : recherche sémantique dans les resource_chunks à partir d'une requête texte.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type SearchBody = {
  query: string;
  matchCount?: number;
  matchThreshold?: number;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await req.json()) as SearchBody;

    const query = (body.query || '').trim();
    const matchCount = body.matchCount && body.matchCount > 0 ? body.matchCount : 8;
    const matchThreshold =
      typeof body.matchThreshold === 'number' ? body.matchThreshold : 0.7;

    if (!query) {
      return NextResponse.json(
        { error: 'Missing query in request body' },
        { status: 400 },
      );
    }

    const apiKey =
      process.env.OPENAI_API_KEY_OWNER || process.env.OPENAI_API_KEY || '';

    if (!apiKey) {
      console.error(
        '[POST /api/resources/search] Missing OpenAI API key (OPENAI_API_KEY_OWNER or OPENAI_API_KEY)',
      );
      return NextResponse.json(
        { error: 'Server misconfigured: OpenAI API key missing' },
        { status: 500 },
      );
    }

    const openai = new OpenAI({ apiKey });

    // 1) Embedding de la requête
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const [first] = embeddingResponse.data;
    if (!first || !first.embedding) {
      console.error('[POST /api/resources/search] No embedding returned');
      return NextResponse.json(
        { error: 'Unable to compute embedding for query' },
        { status: 500 },
      );
    }

    const queryEmbedding = first.embedding;

    // 2) Appel de la fonction match_resource_chunks
    const { data, error } = await supabase.rpc('match_resource_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter: {}, // plus tard : filtrage par theme_principal, langue, etc.
    });

    if (error) {
      console.error(
        '[POST /api/resources/search] Supabase RPC error',
        error,
      );
      return NextResponse.json(
        { error: 'Database error while searching resources' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      query,
      matchCount,
      matchThreshold,
      results: data ?? [],
    });
  } catch (err) {
    console.error('[POST /api/resources/search] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}
