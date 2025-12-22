// app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
// Compat DB: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + tags array), sinon fallback FR (avec alias).

import { NextRequest, NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'

import { getSupabaseServerClient } from '@/lib/supabaseServer'

type PatchBody = Partial<{
  title: string
  content: string
  prompt: string
  type: string
  status: 'draft' | 'planned' | 'published' | 'archived' | string
  scheduledDate: string | null // YYYY-MM-DD
  channel: string
  tags: string[]
}>

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
  tags: string[] | null
  created_at: string | null
  updated_at: string | null
}

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? '').toLowerCase()
  // PostgREST: "column content_item.title does not exist" / "Could not find the 'title' column"
  return (
    m.includes('does not exist') ||
    m.includes("could not find the '") ||
    m.includes('schema cache') ||
    m.includes('pgrst')
  )
}

function asTagsArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string') as string[]
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return []
    // tags en text : "a,b,c" ou JSON "[]"
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string') as string[]
    } catch {
      // ignore
    }
    return t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return null
}

async function getAuthedUserId() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) return { supabase, userId: null, error }
  if (!user?.id) return { supabase, userId: null, error: { message: 'No user' } as PostgrestError }

  return { supabase, userId: user.id }
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id: rawId } = await ctx.params
    const id = (rawId ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const { supabase, userId } = await getAuthedUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    // v2 (EN)
    const v2 = await supabase
      .from('content_item')
      .select('id, user_id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!v2.error) {
      const row = v2.data as any
      const dto: ContentItemDTO = {
        id: row.id,
        user_id: row.user_id,
        type: row.type ?? null,
        title: row.title ?? null,
        prompt: row.prompt ?? null,
        content: row.content ?? null,
        status: row.status ?? null,
        scheduled_date: row.scheduled_date ?? null,
        channel: row.channel ?? null,
        tags: asTagsArray(row.tags),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      }
      return NextResponse.json({ ok: true, item: dto }, { status: 200 })
    }

    if (!isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 })
    }

    // fallback FR
    const fr = await supabase
      .from('content_item')
      .select(
        'id, user_id, type, titre, prompt, contenu, statut, date_planifiee, canal, tags, created_at, updated_at'
      )
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 })
    const row = fr.data as any

    const dto: ContentItemDTO = {
      id: row.id,
      user_id: row.user_id,
      type: row.type ?? null,
      title: row.titre ?? null,
      prompt: row.prompt ?? null,
      content: row.contenu ?? null,
      status: row.statut ?? null,
      scheduled_date: row.date_planifiee ?? null,
      channel: row.canal ?? null,
      tags: asTagsArray(row.tags),
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    }

    return NextResponse.json({ ok: true, item: dto }, { status: 200 })
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

    const patchV2: Record<string, any> = {}
    if (typeof body.title === 'string') patchV2.title = body.title
    if (typeof body.content === 'string') patchV2.content = body.content
    if (typeof body.prompt === 'string') patchV2.prompt = body.prompt
    if (typeof body.type === 'string') patchV2.type = body.type
    if (typeof body.status === 'string') patchV2.status = body.status
    if (typeof body.channel === 'string') patchV2.channel = body.channel
    if (body.scheduledDate !== undefined) patchV2.scheduled_date = body.scheduledDate
    if (body.tags !== undefined) patchV2.tags = body.tags

    const v2 = await supabase
      .from('content_item')
      .update(patchV2)
      .eq('id', id)
      .eq('user_id', userId)
      .select(
        'id, user_id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at'
      )
      .maybeSingle()

    if (!v2.error) {
      const row = v2.data as any
      const dto: ContentItemDTO = {
        id: row.id,
        user_id: row.user_id,
        type: row.type ?? null,
        title: row.title ?? null,
        prompt: row.prompt ?? null,
        content: row.content ?? null,
        status: row.status ?? null,
        scheduled_date: row.scheduled_date ?? null,
        channel: row.channel ?? null,
        tags: asTagsArray(row.tags),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      }
      return NextResponse.json({ ok: true, item: dto }, { status: 200 })
    }

    if (!isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 })
    }

    // fallback FR
    const patchFR: Record<string, any> = {}
    if (typeof body.title === 'string') patchFR.titre = body.title
    if (typeof body.content === 'string') patchFR.contenu = body.content
    if (typeof body.prompt === 'string') patchFR.prompt = body.prompt
    if (typeof body.type === 'string') patchFR.type = body.type
    if (typeof body.status === 'string') patchFR.statut = body.status
    if (typeof body.channel === 'string') patchFR.canal = body.channel
    if (body.scheduledDate !== undefined) patchFR.date_planifiee = body.scheduledDate
    if (body.tags !== undefined) patchFR.tags = body.tags

    const fr = await supabase
      .from('content_item')
      .update(patchFR)
      .eq('id', id)
      .eq('user_id', userId)
      .select(
        'id, user_id, type, titre, prompt, contenu, statut, date_planifiee, canal, tags, created_at, updated_at'
      )
      .maybeSingle()

    if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 })
    const row = fr.data as any

    const dto: ContentItemDTO = {
      id: row.id,
      user_id: row.user_id,
      type: row.type ?? null,
      title: row.titre ?? null,
      prompt: row.prompt ?? null,
      content: row.contenu ?? null,
      status: row.statut ?? null,
      scheduled_date: row.date_planifiee ?? null,
      channel: row.canal ?? null,
      tags: asTagsArray(row.tags),
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    }

    return NextResponse.json({ ok: true, item: dto }, { status: 200 })
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

    // v2
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
