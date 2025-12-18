// app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
// Compat DB: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + tags array), sinon fallback FR (avec alias).

import { NextResponse } from 'next/server'
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
    (m.includes('could not find') && m.includes('column')) ||
    (m.includes('unknown') && m.includes('column'))
  )
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v ?? '').trim()).filter(Boolean)
}

function parseTagsFromDb(value: unknown): string[] {
  if (Array.isArray(value)) return safeStringArray(value)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeItem(raw: Record<string, unknown>): ContentItemDTO {
  const tags = parseTagsFromDb(raw.tags)
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    type: typeof raw.type === 'string' ? raw.type : null,
    title: typeof raw.title === 'string' ? raw.title : null,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : null,
    content: typeof raw.content === 'string' ? raw.content : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    scheduled_date: typeof raw.scheduled_date === 'string' ? raw.scheduled_date : null,
    channel: typeof raw.channel === 'string' ? raw.channel : null,
    tags: tags.length ? tags : [],
    created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  }
}

async function getAuthedUserId() {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user?.id) {
    return { supabase, userId: null as string | null }
  }
  return { supabase, userId: data.user.id }
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = (ctx?.params?.id ?? '').trim()
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

    if (v2.error && isMissingColumnError(v2.error.message)) {
      // FR fallback (avec alias, sans prompt/updated_at si absents)
      const fr = await supabase
        .from('content_item')
        .select(
          'id, user_id, type, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at'
        )
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()

      if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 })
      if (!fr.data) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

      const normalized = normalizeItem({
        ...fr.data,
        prompt: null,
        updated_at: null,
      })

      return NextResponse.json({ ok: true, item: normalized }, { status: 200 })
    }

    if (v2.error) return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 })
    if (!v2.data) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true, item: normalizeItem(v2.data as Record<string, unknown>) }, { status: 200 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = (ctx?.params?.id ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const { supabase, userId } = await getAuthedUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as PatchBody

    const patchV2: Record<string, unknown> = {}
    if (typeof body.title === 'string') patchV2.title = body.title.trim().slice(0, 200)
    if (typeof body.content === 'string') patchV2.content = body.content
    if (typeof body.prompt === 'string') patchV2.prompt = body.prompt
    if (typeof body.type === 'string') patchV2.type = body.type.trim().slice(0, 50)
    if (typeof body.status === 'string') patchV2.status = body.status.trim().slice(0, 30)
    if (typeof body.channel === 'string') patchV2.channel = body.channel.trim().slice(0, 50)
    if (body.scheduledDate === null || typeof body.scheduledDate === 'string') {
      patchV2.scheduled_date = body.scheduledDate
    }
    if (Array.isArray(body.tags)) patchV2.tags = safeStringArray(body.tags)

    if (Object.keys(patchV2).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
    }

    // v2 update
    const v2 = await supabase
      .from('content_item')
      .update(patchV2)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at')
      .maybeSingle()

    if (v2.error && isMissingColumnError(v2.error.message)) {
      // FR update (map)
      const patchFR: Record<string, unknown> = {}

      if (typeof body.title === 'string') patchFR.titre = body.title.trim().slice(0, 200)
      if (typeof body.content === 'string') patchFR.contenu = body.content
      // prompt: colonne potentiellement absente en FR -> ignoré
      if (typeof body.type === 'string') patchFR.type = body.type.trim().slice(0, 50)
      if (typeof body.status === 'string') patchFR.statut = body.status.trim().slice(0, 30)
      if (typeof body.channel === 'string') patchFR.canal = body.channel.trim().slice(0, 50)
      if (body.scheduledDate === null || typeof body.scheduledDate === 'string') {
        patchFR.date_planifiee = body.scheduledDate
      }
      if (Array.isArray(body.tags)) patchFR.tags = safeStringArray(body.tags).join(',')

      if (Object.keys(patchFR).length === 0) {
        return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
      }

      const fr = await supabase
        .from('content_item')
        .update(patchFR)
        .eq('id', id)
        .eq('user_id', userId)
        .select(
          'id, user_id, type, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at'
        )
        .maybeSingle()

      if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 })
      if (!fr.data) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

      const normalized = normalizeItem({
        ...fr.data,
        prompt: null,
        updated_at: null,
      })

      return NextResponse.json({ ok: true, item: normalized }, { status: 200 })
    }

    if (v2.error) return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 })
    if (!v2.data) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true, item: normalizeItem(v2.data as Record<string, unknown>) }, { status: 200 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = (ctx?.params?.id ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const { supabase, userId } = await getAuthedUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    // v2 delete
    const v2 = await supabase.from('content_item').delete().eq('id', id).eq('user_id', userId)

    if (v2.error && isMissingColumnError(v2.error.message)) {
      // FR schema: delete identique (colonnes n'impactent pas DELETE)
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
