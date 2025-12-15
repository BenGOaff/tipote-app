// app/contents/page.tsx
// Page "Mes Contenus" v2.0 : liste + vue calendrier (simple)

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Props = {
  searchParams?: { view?: string };
};

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | null;
  created_at: string | null;
};

function formatDate(d: string | null) {
  if (!d) return "—";
  // scheduled_date is YYYY-MM-DD; display as dd/mm/yyyy
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const [, y, mm, dd] = m;
  return `${dd}/${mm}/${y}`;
}

export default async function ContentsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";
  const view = searchParams?.view === "calendar" ? "calendar" : "list";

  const { data, error } = await supabase
    .from("content_item")
    .select("id, type, title, status, scheduled_date, channel, tags, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const items: ContentItem[] = Array.isArray(data) ? (data as ContentItem[]) : [];
  const hasError = Boolean(error);

  const planned = items.filter((i) => i.scheduled_date);
  const drafts = items.filter((i) => !i.scheduled_date);

  // Group calendar by scheduled_date
  const byDate = new Map<string, ContentItem[]>();
  for (const it of planned) {
    const key = it.scheduled_date || "—";
    const arr = byDate.get(key) ?? [];
    arr.push(it);
    byDate.set(key, arr);
  }
  const dates = Array.from(byDate.keys()).sort();

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Mes Contenus</h1>
            <p className="mt-1 text-sm text-slate-500">
              Retrouvez vos contenus générés et planifiés (publication, statut, canal).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/create"
              className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              + Créer
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/contents?view=list"
            className={[
              "rounded-xl px-3 py-2 text-xs font-semibold border transition",
              view === "list"
                ? "border-[#b042b4] bg-[#b042b4]/10 text-slate-900"
                : "border-slate-200 text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Liste
          </Link>
          <Link
            href="/contents?view=calendar"
            className={[
              "rounded-xl px-3 py-2 text-xs font-semibold border transition",
              view === "calendar"
                ? "border-[#b042b4] bg-[#b042b4]/10 text-slate-900"
                : "border-slate-200 text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Calendrier
          </Link>
        </div>

        {hasError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{error?.message}</p>
          </div>
        ) : null}

        {view === "list" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-slate-900">Derniers contenus</h2>
              <div className="text-xs text-slate-500">
                {items.length} élément{items.length > 1 ? "s" : ""}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <p className="text-sm text-slate-600">Aucun contenu pour le moment.</p>
                <p className="mt-1 text-xs text-slate-500">Crée ton premier contenu en 1 clic.</p>
                <Link
                  href="/create"
                  className="mt-4 inline-flex rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
                >
                  + Créer
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500">
                          {it.type ?? "—"} • {it.channel ?? "—"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
                          {it.title ?? "Sans titre"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                            {it.status ?? "—"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                            Planifié : {formatDate(it.scheduled_date)}
                          </span>
                          {Array.isArray(it.tags) && it.tags.length ? (
                            <span className="text-[11px] text-slate-500 truncate">
                              Tags: {it.tags.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-slate-900">Calendrier</h2>
              <div className="text-xs text-slate-500">
                {planned.length} planifié{planned.length > 1 ? "s" : ""} • {drafts.length}{" "}
                brouillon{drafts.length > 1 ? "s" : ""}
              </div>
            </div>

            {planned.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <p className="text-sm text-slate-600">Aucun contenu planifié pour le moment.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Lors de la génération, renseigne une date planifiée.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
                {dates.map((d) => (
                  <div key={d} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{formatDate(d)}</p>
                      <p className="text-xs text-slate-500">{byDate.get(d)?.length ?? 0} item(s)</p>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {(byDate.get(d) ?? []).map((it) => (
                        <div
                          key={it.id}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <p className="text-[11px] text-slate-500">
                            {it.type ?? "—"} • {it.channel ?? "—"}
                          </p>
                          <p className="text-sm font-semibold text-slate-900">
                            {it.title ?? "Sans titre"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
