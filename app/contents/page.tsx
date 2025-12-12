// app/contents/page.tsx
// Page "Mes Contenus" v2.0 : liste + vue calendrier (placeholder)

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Props = {
  searchParams?: { view?: string };
};

export default async function ContentsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";
  const view = searchParams?.view === "calendar" ? "calendar" : "list";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
              Mes Contenus
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Retrouvez vos contenus générés et planifiés (publication, statut, canal).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/create"
              className="rounded-xl bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              Créer un contenu
            </Link>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-2">
          <Link
            href="/contents?view=list"
            className={[
              "rounded-lg border px-3 py-1.5 text-xs",
              view === "list"
                ? "border-[#b042b4] text-[#b042b4] bg-[#b042b4]/5"
                : "border-slate-200 text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Liste
          </Link>
          <Link
            href="/contents?view=calendar"
            className={[
              "rounded-lg border px-3 py-1.5 text-xs",
              view === "calendar"
                ? "border-[#b042b4] text-[#b042b4] bg-[#b042b4]/5"
                : "border-slate-200 text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Calendrier
          </Link>
        </div>

        {/* Stats */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Planifiés", value: "—" },
            { label: "Publiés", value: "—" },
            { label: "Brouillons", value: "—" },
            { label: "En retard", value: "—" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{s.value}</p>
            </div>
          ))}
        </section>

        {view === "list" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Liste des contenus</h2>
              <p className="text-xs text-slate-500">Placeholder (brancher Supabase ensuite)</p>
            </div>

            <div className="mt-4 space-y-3">
              {[
                { title: "Post LinkedIn - Hook + CTA", status: "Brouillon", channel: "LinkedIn" },
                { title: "Email newsletter - Offre du mois", status: "Planifié", channel: "Email" },
                { title: "Script Reels - 3 erreurs courantes", status: "À faire", channel: "Instagram" },
              ].map((c) => (
                <div
                  key={c.title}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Canal: <span className="font-medium">{c.channel}</span>
                    </p>
                  </div>
                  <span className="text-[11px] rounded-full border border-slate-200 px-2 py-1 text-slate-600">
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Calendrier éditorial</h2>
              <p className="text-xs text-slate-500">Placeholder</p>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-600">
                La vue calendrier sera branchée sur les contenus planifiés.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                (Ensuite : drag & drop, filtres, statuts, canaux…)
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
