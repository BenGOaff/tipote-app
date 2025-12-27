// app/app/page.tsx
// Dashboard "Aujourd'hui" (aligné Lovable + cahier des charges)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - UI : banner “Ta prochaine action” + stats + progress semaine + actions rapides + à venir

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

import AppShell from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import MarkTaskDoneButton from '@/components/dashboard/MarkTaskDoneButton'
import DailyFocus from '@/components/dashboard/DailyFocus'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

import {
  Brain,
  TrendingUp,
  Calendar,
  FileText,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Target,
  Play,
} from 'lucide-react'

type TaskItem = {
  id: string
  title: string
  status: string | null
  due_date: string | null
  priority: string | null
  source: string | null
  created_at: string | null
}

type ContentItem = {
  id: string
  type: string | null
  title: string | null
  status: string | null
  scheduled_date: string | null
  channel: string | null
  created_at: string | null
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function toIdString(x: unknown): string {
  if (typeof x === 'string') return x
  if (typeof x === 'number') return String(x)
  if (typeof x === 'bigint') return String(x)
  return ''
}

function toStrOrNull(x: unknown): string | null {
  if (typeof x === 'string') return x
  return null
}

function parseDateSafe(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isDoneStatus(status: string | null): boolean {
  const s = (status ?? '').trim().toLowerCase()
  return s === 'done' || s === 'completed' || s === 'fait' || s === 'terminé' || s === 'termine'
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0
  const v = Math.round((n / d) * 100)
  return Math.max(0, Math.min(100, v))
}

function fmtDateFR(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long' }).format(d)
  } catch {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${dd}/${mm}`
  }
}

function fmtIsoMaybe(iso: string | null): string {
  const d = parseDateSafe(iso)
  if (!d) return '—'
  return fmtDateFR(d)
}

function channelLabel(x: string | null): string {
  const s = (x ?? '').trim().toLowerCase()
  if (!s) return '—'
  if (s.includes('instagram')) return 'Instagram'
  if (s.includes('linkedin')) return 'LinkedIn'
  if (s.includes('email')) return 'Email'
  if (s.includes('blog')) return 'Blog'
  if (s.includes('tiktok')) return 'TikTok'
  if (s.includes('youtube')) return 'YouTube'
  if (s.includes('facebook')) return 'Facebook'
  if (s.includes('twitter') || s === 'x') return 'X'
  return x ?? '—'
}

function typeLabel(x: string | null): string {
  const s = (x ?? '').trim().toLowerCase()
  if (!s) return 'Contenu'
  if (s.includes('post')) return 'Post'
  if (s.includes('email')) return 'Email'
  if (s.includes('blog')) return 'Article'
  if (s.includes('script')) return 'Script vidéo'
  if (s.includes('video')) return 'Vidéo'
  if (s.includes('carousel')) return 'Carousel'
  return x ?? 'Contenu'
}

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  const userId = user.id
  const userEmail = user.email ?? ''

  // Plan stratégique requis
  const { data: planRow } = await supabase
    .from('business_plan')
    .select('id, plan_json')
    .eq('user_id', userId)
    .maybeSingle()

  if (!planRow) redirect('/onboarding')

  const planJson: unknown = isRecord(planRow) ? planRow.plan_json : null

  // Tâches
  const { data: tasksData } = await supabase
    .from('project_tasks')
    .select('id, title, status, due_date, priority, source, created_at')
    .eq('user_id', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const tasks: TaskItem[] = Array.isArray(tasksData)
    ? tasksData
        .map((r: unknown) => {
          if (!isRecord(r)) return null
          const id = toIdString(r.id)
          const title = toStrOrNull(r.title) ?? ''
          if (!id || !title) return null
          return {
            id,
            title,
            status: toStrOrNull(r.status),
            due_date: toStrOrNull(r.due_date),
            priority: toStrOrNull(r.priority),
            source: toStrOrNull(r.source),
            created_at: toStrOrNull(r.created_at),
          } satisfies TaskItem
        })
        .filter((x: TaskItem | null): x is TaskItem => x !== null)
    : []

  // Contenus
  const { data: contentsData } = await supabase
    .from('content_item')
    .select('id, type, title, status, scheduled_date, channel, created_at')
    .eq('user_id', userId)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  const contents: ContentItem[] = Array.isArray(contentsData)
    ? contentsData
        .map((r: unknown) => {
          if (!isRecord(r)) return null
          const id = toIdString(r.id)
          if (!id) return null
          return {
            id,
            type: toStrOrNull(r.type),
            title: toStrOrNull(r.title),
            status: toStrOrNull(r.status),
            scheduled_date: toStrOrNull(r.scheduled_date),
            channel: toStrOrNull(r.channel),
            created_at: toStrOrNull(r.created_at),
          } satisfies ContentItem
        })
        .filter((x: ContentItem | null): x is ContentItem => x !== null)
    : []

  const now = new Date()
  const today0 = startOfDay(now)
  const tomorrow0 = new Date(today0.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd = new Date(today0.getTime() + 7 * 24 * 60 * 60 * 1000)

  const openTasks = tasks.filter((t) => !isDoneStatus(t.status))
  const doneTasks = tasks.filter((t) => isDoneStatus(t.status))

  const nextTask =
    openTasks.find((t) => {
      const d = parseDateSafe(t.due_date)
      if (!d) return false
      const dd = startOfDay(d)
      return dd >= today0 && dd < tomorrow0
    }) ??
    openTasks.find((t) => {
      const d = parseDateSafe(t.due_date)
      if (!d) return false
      const dd = startOfDay(d)
      return dd < today0
    }) ??
    openTasks[0] ??
    null

  const upcomingThisWeek = contents
    .map((c) => ({ ...c, _date: parseDateSafe(c.scheduled_date) }))
    .filter((c) => c._date && c._date >= today0 && c._date < weekEnd)
    .sort((a, b) => a._date!.getTime() - b._date!.getTime())
    .slice(0, 6)

  const publishedCount = contents.filter((c) => (c.status ?? '').toLowerCase() === 'published').length
  const scheduledCount = contents.filter((c) => (c.status ?? '').toLowerCase() === 'scheduled').length

  const tasksTotal = tasks.length
  const tasksDone = doneTasks.length
  const tasksOpen = openTasks.length

  const weekProgress = pct(tasksDone, Math.max(1, tasksTotal))

  const mission =
    isRecord(planJson) && typeof planJson.mission === 'string'
      ? (planJson.mission as string)
      : isRecord(planJson) && typeof planJson.objective === 'string'
        ? (planJson.objective as string)
        : null

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">Aujourd’hui</div>
          <div className="truncate text-sm text-muted-foreground">
            {mission ? mission : 'Ton cockpit business : next action, stats et contenus à venir.'}
          </div>
        </div>
      }
      headerRight={
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="bg-[#b042b4] hover:bg-[#b042b4]/90">
            <Link href="/create" className="inline-flex items-center gap-2">
              <Play className="h-4 w-4" />
              Créer en 1 clic
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/analytics" className="inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Analytics
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Banner "Ta prochaine action" */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-white/20" />
            <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-white/15" />
          </div>

          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white/15 p-3">
                  <Sparkles className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <p className="text-white/80">Ta prochaine action</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                    {nextTask ? nextTask.title : 'Aucune tâche urgente pour aujourd’hui'}
                  </h1>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                      <Target className="mr-1.5 h-4 w-4" />
                      Focus : {nextTask ? 'Tâche' : 'Stratégie / Contenu'}
                    </Badge>

                    <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      {tasksDone}/{tasksTotal} tâches faites
                    </Badge>

                    <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                      <Calendar className="mr-1.5 h-4 w-4" />
                      {upcomingThisWeek.length} contenus cette semaine
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="bg-white text-violet-700 hover:bg-white/90">
                      <Link href="/create" className="inline-flex items-center gap-2">
                        <Play className="h-4 w-4" />
                        Créer en 1 clic
                      </Link>
                    </Button>

                    <Button
                      asChild
                      size="sm"
                      variant="secondary"
                      className="border-0 bg-white/15 text-white hover:bg-white/20"
                    >
                      <Link href="/tasks" className="inline-flex items-center gap-2">
                        Voir les tâches
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>

                    <Button
                      asChild
                      size="sm"
                      variant="secondary"
                      className="border-0 bg-white/15 text-white hover:bg-white/20"
                    >
                      <Link href="/strategy">Voir la stratégie</Link>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="hidden shrink-0 md:block">
                <Brain className="h-20 w-20 text-white/30" />
              </div>
            </div>
          </div>
        </Card>

        {/* Focus du jour */}
        <DailyFocus
          task={
            nextTask
              ? {
                  id: nextTask.id,
                  title: nextTask.title,
                  status: nextTask.status,
                  due_date: nextTask.due_date,
                }
              : null
          }
        />

        {/* 4 stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Tâches ouvertes</p>
              <div className="rounded-xl bg-muted/30 p-2">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold">{tasksOpen}</p>
            <p className="mt-1 text-xs text-muted-foreground">À terminer</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Tâches faites</p>
              <div className="rounded-xl bg-muted/30 p-2">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold">{tasksDone}</p>
            <p className="mt-1 text-xs text-muted-foreground">Au total</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Contenus publiés</p>
              <div className="rounded-xl bg-muted/30 p-2">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold">{publishedCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Au total</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Contenus planifiés</p>
              <div className="rounded-xl bg-muted/30 p-2">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold">{scheduledCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">À venir</p>
          </Card>
        </div>

        {/* Progress semaine + actions rapides */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Progression</p>
                <p className="mt-1 text-sm text-muted-foreground">Reste constant, avance chaque jour.</p>
              </div>
              <Badge variant="secondary">{weekProgress}%</Badge>
            </div>

            <div className="mt-4 space-y-2">
              <Progress value={weekProgress} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{tasksDone} faites</span>
                <span>{tasksTotal} total</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/tasks" className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Gérer les tâches
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/create" className="inline-flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Créer en 1 clic
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/contents" className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Content Hub
                </Link>
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Actions rapides</p>
                <p className="mt-1 text-sm text-muted-foreground">2 clics & tu es lancé.</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-2">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <Button asChild variant="secondary" className="justify-between">
                <Link href="/strategy">
                  <span className="inline-flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Voir stratégie
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Link>
              </Button>

              <Button asChild variant="secondary" className="justify-between">
                <Link href="/tasks">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Mes tâches
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Link>
              </Button>

              <Button asChild variant="secondary" className="justify-between">
                <Link href="/contents">
                  <span className="inline-flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Content Hub
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Link>
              </Button>

              <Button asChild variant="outline" className="justify-between">
                <Link href="/settings">
                  <span className="inline-flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Paramètres
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* Tâches + contenus à venir */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Tâches en cours</p>
                <p className="mt-1 text-sm text-muted-foreground">Ta liste courte pour aujourd’hui.</p>
              </div>

              <Button asChild size="sm" variant="outline">
                <Link href="/tasks" className="inline-flex items-center gap-2">
                  Tout voir
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {openTasks.length > 0 ? (
                <div className="space-y-2">
                  {openTasks.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Échéance : {fmtIsoMaybe(t.due_date)}
                        </p>
                      </div>
                      <MarkTaskDoneButton taskId={t.id} initialStatus={t.status} className="shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    Aucune tâche pour l’instant. Synchronise ou ajoute tes tâches.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/tasks">Voir / Sync</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href="/create">Créer du contenu</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">À venir cette semaine</p>
                <p className="mt-1 text-sm text-muted-foreground">Contenus planifiés & idées.</p>
              </div>

              <Button asChild size="sm" variant="outline">
                <Link href="/contents" className="inline-flex items-center gap-2">
                  Content Hub
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {upcomingThisWeek.length > 0 ? (
                <div className="space-y-2">
                  {upcomingThisWeek.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.title ?? 'Sans titre'}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c._date ? fmtDateFR(c._date) : '—'} • {typeLabel(c.type)} • {channelLabel(c.channel)}
                        </p>
                      </div>

                      <Badge variant="secondary" className="shrink-0">
                        {(c.status ?? 'draft').toLowerCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    Rien de planifié pour la semaine. Lance une création rapide.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href="/create">Créer en 1 clic</Link>
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/contents">Planifier</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Rythme & constance</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Un petit pas aujourd’hui → une semaine solide.
              </p>
            </div>

            <div className="rounded-2xl bg-muted/30 p-3">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
