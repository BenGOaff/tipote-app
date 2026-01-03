// app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
// Compat DB: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// + certaines n'ont PAS prompt / updated_at.
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + tags array), sinon fallback FR (avec alias).
// -> si colonnes optionnelles (prompt, updated_at) manquent, on retry sans elles.

import { NextRequest, NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'

import { getSupabaseServerClient } from '@/lib/supabaseServer'

type RouteContext = { params: Promise<{ id: string }> }

type ContentRowV2 = {
  id: string
  user_id: string
  type: string | null
  title: string | null
  prompt?: string | null
  content: string | null
  status: string | null
  scheduled_date: string | null
  channel: string | null
  tags: string[] | string | null
  created_at: string | null
  updated_at?: string | null
}

type ContentRowFR = {
  id: string
  user_id: string
  type: string | null
  titre: string | null
  prompt?: string | null
  contenu: string | null
  statut: string | null
  date_planifiee: string | null
  canal: string | null
  tags: string[] | string | null
  created_at: string | null
  updated_at?: string | null
}

type ContentItemDTO = {
  id: string
  user_id: string
  type: string | null
  title: string | null
  prompt: string | null
  content: string | null
  status: string | null
  scheduled_date: string | null
  channel: string | null
  tags: string[]
  created_at: string | null
  updated_at: string | null
}

type PatchBody = {
  type?: string
  title?: string
  prompt?: string
  content?: string
  status?: string
  scheduledDate?: string | null
  channel?: string | null
  tags?: string[] | string | null
}

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? '').toLowerCase()
  return (
    m.includes('does not exist') ||
    m.includes("could not find the '") ||
    m.includes('schema cache') ||
    m.includes('pgrst') ||
    (m.includes('column') && (m.includes('exist') || m.includes('unknown')))
  )
}

function asTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String).map((s) => s.trim()).filter(Boolean)
  if (typeof tags === 'string')
    return tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  return []
}

function tagsArrayToLegacyText(tags: unknown): string | null {
  const arr = asTagsArray(tags)
  if (!arr.length) return ''
  return arr.join(', ')
}

async function getAuthedUserId() {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return { supabase, userId: null as string | null }
  return { supabase, userId: data.user?.id ?? null }
}

async function fetchContentV2(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  id: string
  userId: string
}): Promise<{ ok: true; row: ContentRowV2 } | { ok: false; notFound?: boolean; error?: string; missingColumns?: boolean }> {
  const { supabase, id, userId } = params

  // 1) Try with optional columns (prompt, updated_at)
  const first = await supabase
    .from('content_item')
    .select('id, user_id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!first.error && first.data) return { ok: true, row: first.data as any }

  if (first.error && !isMissingColumnError(first.error.message)) {
    return { ok: false, error: first.error.message }
  }

  // 2) Retry without optional columns
  const retry = await supabase
    .from('content_item')
    .select('id, user_id, type, title, content, status, scheduled_date, channel, tags, created_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!retry.error && retry.data) return { ok: true, row: retry.data as any }

  if (retry.error) {
    if (isMissingColumnError(retry.error.message)) return { ok: false, missingColumns: true }
    return { ok: false, error: retry.error.message }
  }

  return { ok: false, notFound: true }
}

async function fetchContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  id: string
  userId: string
}): Promise<{ ok: true; row: ContentRowFR } | { ok: false; notFound?: boolean; error?: string }> {
  const { supabase, id, userId } = params

  // 1) Try with optional columns (prompt, updated_at)
  const first = await supabase
    .from('content_item')
    .select('id, user_id, type, titre, prompt, contenu, statut, date_planifiee, canal, tags, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!first.error && first.data) return { ok: true, row: first.data as any }

  if (first.error && !isMissingColumnError(first.error.message)) {
    return { ok: false, error: first.error.message }
  }

  // 2) Retry without optional columns
  const retry = await supabase
    .from('content_item')
    .select('id, user_id, type, titre, contenu, statut, date_planifiee, canal, tags, created_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!retry.error && retry.data) return { ok: true, row: retry.data as any }

  if (retry.error) return { ok: false, error: retry.error.message }
  return { ok: false, notFound: true }
}

function dtoFromV2(row: ContentRowV2): ContentItemDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type ?? null,
    title: row.title ?? null,
    prompt: (row as any).prompt ?? null,
    content: row.content ?? null,
    status: row.status ?? null,
    scheduled_date: row.scheduled_date ?? null,
    channel: row.channel ?? null,
    tags: asTagsArray(row.tags),
    created_at: row.created_at ?? null,
    updated_at: (row as any).updated_at ?? null,
  }
}

function dtoFromFR(row: ContentRowFR): ContentItemDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type ?? null,
    title: row.titre ?? null,
    prompt: (row as any).prompt ?? null,
    content: row.contenu ?? null,
    status: row.statut ?? null,
    scheduled_date: row.date_planifiee ?? null,
    channel: row.canal ?? null,
    tags: asTagsArray(row.tags),
    created_at: row.created_at ?? null,
    updated_at: (row as any).updated_at ?? null,
  }
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id: rawId } = await ctx.params
    const id = (rawId ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const { supabase, userId } = await getAuthedUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    // V2 d'abord
    const v2 = await fetchContentV2({ supabase, id, userId })
    if (v2.ok) {
      return NextResponse.json({ ok: true, item: dtoFromV2(v2.row) }, { status: 200 })
    }
    if (v2.error) {
      return NextResponse.json({ ok: false, error: v2.error }, { status: 400 })
    }
    // si missingColumns (ou notFound), on tente FR (car schéma prod actuel = FR)
    const fr = await fetchContentFR({ supabase, id, userId })
    if (fr.ok) {
      return NextResponse.json({ ok: true, item: dtoFromFR(fr.row) }, { status: 200 })
    }
    if (fr.notFound) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: false, error: fr.error ?? 'Unknown error' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id: rawId } = await ctx.params
    const id = (rawId ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const { supabase, userId } = await getAuthedUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as PatchBody

    // V2 patch
    const patchV2: Record<string, any> = {}
    if (typeof body.title === 'string') patchV2.title = body.title
    if (typeof body.content === 'string') patchV2.content = body.content
    if (typeof body.prompt === 'string') patchV2.prompt = body.prompt
    if (typeof body.type === 'string') patchV2.type = body.type
    if (typeof body.status === 'string') patchV2.status = body.status
    if (typeof body.channel === 'string') patchV2.channel = body.channel
    if (body.scheduledDate !== undefined) patchV2.scheduled_date = body.scheduledDate
    if (body.tags !== undefined) patchV2.tags = body.tags

    // 1) Try update V2 + select with optional cols
    let v2 = await supabase
      .from('content_item')
      .update(patchV2)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at')
      .maybeSingle()

    // Retry update V2 without prompt if column missing
    if (v2.error && isMissingColumnError(v2.error.message) && 'prompt' in patchV2) {
      const { prompt, ...patchNoPrompt } = patchV2
      v2 = await supabase
        .from('content_item')
        .update(patchNoPrompt)
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, user_id, type, title, content, status, scheduled_date, channel, tags, created_at')
        .maybeSingle()
    }

    // Retry select without optional cols if needed (update succeeded but select failed on missing columns)
    if (v2.error && isMissingColumnError(v2.error.message)) {
      v2 = await supabase
        .from('content_item')
        .select('id, user_id, type, title, content, status, scheduled_date, channel, tags, created_at')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()
    }

    if (!v2.error && v2.data) {
      return NextResponse.json({ ok: true, item: dtoFromV2(v2.data as any) }, { status: 200 })
    }

    if (v2.error && !isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 })
    }

    // fallback FR patch
    const patchFR: Record<string, any> = {}
    if (typeof body.title === 'string') patchFR.titre = body.title
    if (typeof body.content === 'string') patchFR.contenu = body.content
    if (typeof body.prompt === 'string') patchFR.prompt = body.prompt
    if (typeof body.type === 'string') patchFR.type = body.type
    if (typeof body.status === 'string') patchFR.statut = body.status
    if (typeof body.channel === 'string') patchFR.canal = body.channel
    if (body.scheduledDate !== undefined) patchFR.date_planifiee = body.scheduledDate
    if (body.tags !== undefined) patchFR.tags = body.tags

    // 1) Try FR update + select with optional cols
    let fr = await supabase
      .from('content_item')
      .update(patchFR)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, type, titre, prompt, contenu, statut, date_planifiee, canal, tags, created_at, updated_at')
      .maybeSingle()

    // Retry FR update without prompt if column missing
    if (fr.error && isMissingColumnError(fr.error.message) && 'prompt' in patchFR) {
      const { prompt, ...patchNoPrompt } = patchFR
      fr = await supabase
        .from('content_item')
        .update(patchNoPrompt)
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, user_id, type, titre, contenu, statut, date_planifiee, canal, tags, created_at')
        .maybeSingle()
    }

    // Retry tags mismatch (array vs text): convert to legacy text, with/without prompt depending on schema
    if (fr.error && /array|json|malformed|invalid input/i.test(fr.error.message ?? '') && body.tags !== undefined) {
      const patchRetryBase: Record<string, any> = { ...patchFR, tags: tagsArrayToLegacyText(body.tags) }
      // If prompt column is missing, remove it in retry too
      if ('prompt' in patchRetryBase) {
        fr = await supabase
          .from('content_item')
          .update(patchRetryBase)
          .eq('id', id)
          .eq('user_id', userId)
          .select('id, user_id, type, titre, prompt, contenu, statut, date_planifiee, canal, tags, created_at, updated_at')
          .maybeSingle()

        if (fr.error && isMissingColumnError(fr.error.message)) {
          const { prompt, ...patchRetryNoPrompt } = patchRetryBase
          fr = await supabase
            .from('content_item')
            .update(patchRetryNoPrompt)
            .eq('id', id)
            .eq('user_id', userId)
            .select('id, user_id, type, titre, contenu, statut, date_planifiee, canal, tags, created_at')
            .maybeSingle()
        }
      } else {
        fr = await supabase
          .from('content_item')
          .update(patchRetryBase)
          .eq('id', id)
          .eq('user_id', userId)
          .select('id, user_id, type, titre, contenu, statut, date_planifiee, canal, tags, created_at')
          .maybeSingle()
      }
    }

    // Retry select without optional cols if needed
    if (fr.error && isMissingColumnError(fr.error.message)) {
      fr = await supabase
        .from('content_item')
        .select('id, user_id, type, titre, contenu, statut, date_planifiee, canal, tags, created_at')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()
    }

    if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 })
    if (!fr.data) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true, item: dtoFromFR(fr.data as any) }, { status: 200 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id: rawId } = await ctx.params
    const id = (rawId ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const { supabase, userId } = await getAuthedUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const v2 = await supabase.from('content_item').delete().eq('id', id).eq('user_id', userId)
    if (v2.error && isMissingColumnError(v2.error.message)) {
      const fr = await supabase.from('content_item').delete().eq('id', id).eq('user_id', userId)
      if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 })
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (v2.error) return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export function handleError(error: unknown) {
  const e = error as PostgrestError | null
  return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 })
}
