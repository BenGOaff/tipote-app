// app/contents/[id]/page.tsx
// Détail d'un contenu + édition (server component)
// Best-of: UX (écran erreur + introuvable) + sécurité prod (pas de fuite d'infos) + garde-fous id
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + prompt/updated_at), sinon fallback FR.

import Link from "next/link";
import { redirect } from "next/navigation";

import type { PostgrestError } from "@supabase/supabase-js";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ContentEditor } from "@/components/content/ContentEditor";

type Props = {
  params: { id: string };
};

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("column");
}

function normalizeTags(input: unknown): string[] | null {
  if (!input) return null;
  if (Array.isArray(input)) return input.filter(Boolean).map(String);
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    return s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return null;
}

function normalizeItem(raw: Record<string, unknown>): ContentItem {
  const tags = normalizeTags(raw["tags"]);
  return {
    id: String(raw["id"] ?? ""),
    type: (raw["type"] as string | null) ?? null,
    title: (raw["title"] as string | null) ?? null,
    prompt: (raw["prompt"] as string | null) ?? null,
    content: (raw["content"] as string | null) ?? null,
    status: (raw["status"] as string | null) ?? null,
    scheduled_date: (raw["scheduled_date"] as string | null) ?? null,
    channel: (raw["channel"] as string | null) ?? null,
    tags,
    created_at: (raw["created_at"] as string | null) ?? null,
    updated_at: (raw["updated_at"] as string | null) ?? null,
  };
}

export default async function ContentDetailPage({ params }: Props) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const userEmail = session.user.email ?? "";
  const id = params?.id?.trim();

  if (!id) redirect("/contents");

  const isProd = process.env.NODE_ENV === "production";

  // 1) Try v2 schema
  const v2 = await supabase
    .from("content_item")
    .select("id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();

  let item: ContentItem | null = v2.data ? normalizeItem(v2.data as unknown as Record<string, unknown>) : null;
  let error: PostgrestError | null = v2.error ?? null;

  // 2) Fallback FR schema
  if (error && isMissingColumnError(error.message)) {
    const fb = await supabase
      .from("content_item")
      .select(
        "id, type, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at"
      )
      .eq("id", id)
      .eq("user_id", session.user.id)
      .maybeSingle();

    error = fb.error ?? null;

    if (fb.data) {
      const normalized = normalizeItem(fb.data as unknown as Record<string, unknown>);
      item = {
        ...normalized,
        prompt: normalized.prompt ?? null,
        updated_at: normalized.updated_at ?? normalized.created_at ?? null,
      };
    } else {
      item = null;
    }
  }

  if (error) {
    return (
      <AppShell userEmail={userEmail}>
        <div className="mx-auto w-full max-w-4xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <Link href="/contents" className="text-sm font-semibold text-slate-700 hover:underline">
              ← Retour
            </Link>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            Erreur : {isProd ? "Impossible de charger le contenu." : error.message}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!item || !item.id) {
    return (
      <AppShell userEmail={userEmail}>
        <div className="mx-auto w-full max-w-4xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <Link href="/contents" className="text-sm font-semibold text-slate-700 hover:underline">
              ← Retour
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
            Contenu introuvable.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/contents" className="text-sm font-semibold text-slate-700 hover:underline">
            ← Retour
          </Link>

          <Link
            href="/contents"
            className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
          >
            Mes contenus
          </Link>
        </div>

        <ContentEditor initialItem={item} />
      </div>
    </AppShell>
  );
}
