// lib/resources.ts
// Helpers backend pour interroger les ressources IA.

import OpenAI from 'openai';
import { getSupabaseServerClient } from './supabaseServer';

export type ResourceChunkMatch = {
  id: string;
  resource_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

export async function searchResourceChunks(options: {
  query: string;
  matchCount?: number;
  matchThreshold?: number;
}): Promise<ResourceChunkMatch[]> {
  const { query, matchCount = 10, matchThreshold = 0.5 } = options;
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const apiKey =
    process.env.OPENAI_API_KEY_OWNER ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY_OWNER (ou OPENAI_API_KEY) est manquant côté serveur',
    );
  }

  const openai = new OpenAI({ apiKey });
  const supabase = await getSupabaseServerClient();

  // 1) Embedding de la requête
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: trimmed,
  });

  const embedding = embeddingResponse.data[0]?.embedding;
  if (!embedding) {
    throw new Error("Impossible d'obtenir un embedding pour la requête");
  }

  // 2) Appel de la fonction SQL
  const { data, error } = await supabase.rpc('match_resource_chunks', {
    query_embedding: embedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });

  if (error) {
    console.error('[searchResourceChunks] Supabase RPC error', error);
    throw new Error('Erreur lors de la recherche dans les ressources');
  }

  return (data ?? []) as ResourceChunkMatch[];
}
