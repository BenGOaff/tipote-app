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

    let body: SearchBody | null = null;

    try {
      body = (await req.json()) as SearchBody | null;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const rawQuery = body?.query ?? '';
    const query = rawQuery.trim();

    if (!query) {
      return NextResponse.json(
        { error: 'Missing "query" in request body' },
        { status: 400 },
      );
    }

    const matchCount =
      typeof body?.matchCount === 'number' &&
      Number.isFinite(body.matchCount) &&
      body.matchCount > 0 &&
      body.matchCount <= 50
        ? Math.floor(body.matchCount)
        : 10;

    const matchThreshold =
      typeof body?.matchThreshold === 'number' &&
      Number.isFinite(body.matchThreshold)
        ? body.matchThreshold
        : 0.5;

    const apiKey =
      process.env.OPENAI_API_KEY_OWNER ?? process.env.OPENAI_API_KEY;

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

    if (!embeddingResponse.data?.[0]?.embedding) {
      console.error(
        '[POST /api/resources/search] No embedding returned by OpenAI',
      );
      return NextResponse.json(
        { error: 'Failed to create embedding for query' },
        { status: 500 },
      );
    }

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2) Appel de la fonction SQL match_resource_chunks
    const { data, error } = await supabase.rpc('match_resource_chunks', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });

    if (error) {
      console.error(
        '[POST /api/resources/search] Supabase RPC error',
        error,
      );
      return NextResponse.json(
        { error: 'Failed to query resource chunks' },
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
