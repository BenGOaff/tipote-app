// app/contents/[id]/page.tsx
// Détail d'un contenu + édition (server component)
// Best-of: UX (écran erreur + introuvable) + sécurité prod (pas de fuite d'infos) + garde-fous id
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date), sinon fallback FR.

export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ContentEditor } from "@/components/content/ContentEditor";

type ContentItem = {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | null;
  meta?: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
};

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("unknown"));
}

function normalizeTags(tags: any): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean).map((t) => String(t));
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

async function fetchContentItem(userId: string, id: string): Promise<{ item: ContentItem | null; error?: string }> {
  const supabase = await getSupabaseServerClient();

  // V2 (colonnes EN) — on tente avec colonnes optionnelles puis on fallback
  const v2Try = await supabase
    .from("content_item")
    .select(
      "id, user_id, type, title, prompt, content, status, scheduled_date, channel, tags, meta, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!v2Try.error) {
    const row = (v2Try.data ?? null) as any | null;
    if (!row) return { item: null };

    const item: ContentItem = {
      id: String(row.id),
      user_id: String(row.user_id),
      type: row.type ?? null,
      title: row.title ?? null,
      prompt: row.prompt ?? null,
      content: row.content ?? null,
      status: row.status ?? null,
      scheduled_date: row.scheduled_date ?? null,
      channel: row.channel ?? null,
      tags: normalizeTags(row.tags),
      meta: row.meta ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };

    return { item };
  }

  // Si erreur autre que colonne manquante => afficher l'erreur
  if (!isMissingColumnError(v2Try.error.message)) {
    return { item: null, error: v2Try.error.message };
  }

  // Fallback FR (aliasing) — on tente avec colonnes optionnelles puis retry sans
  const frTry = await supabase
    .from("content_item")
    .select(
      "id, user_id, type, title:titre, prompt, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, meta, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!frTry.error) {
    const row = (frTry.data ?? null) as any | null;
    if (!row) return { item: null };

    const item: ContentItem = {
      id: String(row.id),
      user_id: String(row.user_id),
      type: row.type ?? null,
      title: row.title ?? null,
      prompt: row.prompt ?? null,
      content: row.content ?? null,
      status: row.status ?? null,
      scheduled_date: row.scheduled_date ?? null,
      channel: row.channel ?? null,
      tags: normalizeTags(row.tags),
      meta: row.meta ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };

    return { item };
  }

  if (!isMissingColumnError(frTry.error.message)) {
    return { item: null, error: frTry.error.message };
  }

  // retry FR sans prompt/updated_at (fréquent en prod)
  const frRetry = await supabase
    .from("content_item")
    .select("id, user_id, type, titre, contenu, statut, date_planifiee, canal, tags, meta, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (frRetry.error) return { item: null, error: frRetry.error.message };

  const row = (frRetry.data ?? null) as any | null;
  if (!row) return { item: null };

  const item: ContentItem = {
    id: String(row.id),
    user_id: String(row.user_id),
    type: row.type ?? null,
    title: row.titre ?? null,
    prompt: null,
    content: row.contenu ?? null,
    status: row.statut ?? null,
    scheduled_date: row.date_planifiee ?? null,
    channel: row.canal ?? null,
    tags: normalizeTags(row.tags),
    meta: row.meta ?? null,
    created_at: row.created_at ?? null,
    updated_at: null,
  };

  return { item };
}

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await getSupabaseServerClient();
  const { id } = await params;

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.id) redirect("/login");

  const safeId = String(id ?? "").trim();
  if (!safeId) redirect("/contents");

  const { item, error } = await fetchContentItem(authUser.id, safeId);

  const email = authUser.email ?? "";

  if (error) {
    return (
      <AppShell userEmail={email} headerTitle="Contenu">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Impossible de charger ce contenu</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Une erreur est survenue. Réessaie ou reviens à la liste.
              </p>
            </div>
            <Link
              href="/contents"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95"
            >
              Mes contenus
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-semibold">Détail technique</div>
            <div className="mt-2 text-sm text-muted-foreground">{error}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell userEmail={email} headerTitle="Contenu">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Contenu introuvable</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ce contenu n’existe pas (ou tu n’y as pas accès).
              </p>
            </div>
            <Link
              href="/contents"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95"
            >
              Mes contenus
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userEmail={email} headerTitle="Contenu">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contenu</h1>
            <p className="mt-1 text-sm text-muted-foreground">Modifie et organise ton contenu.</p>
          </div>
          <Link
            href="/contents"
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95"
          >
            Mes contenus
          </Link>
        </div>

        <ContentEditor initialItem={item} />
      </div>
    </AppShell>
  );
}
