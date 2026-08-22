// app/admin/page.tsx
// Admin dashboard — accessible uniquement aux emails autorisés
// Protégé côté server (redirect) + middleware + API admin

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import AdminUsersPageClient from "@/components/admin/AdminUsersPageClient";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isAdminEmail } from "@/lib/adminEmails";

export default async function AdminPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? "";
  const userEmail = session?.user?.email ?? "";

  if (!userId) {
    redirect("/");
  }

  if (!isAdminEmail(userEmail)) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={<div>Admin</div>}
      contentClassName="flex-1 p-4 lg:p-6 space-y-6"
    >
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Gestion manuelle des plans, crédits et accès.
        </div>
      </div>

      {/* Raccourcis admin (slugs faciles a retrouver). */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/admin/support"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Admin du centre d&apos;aide
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            /admin/support
          </code>
        </a>

        {/* LE PILOTAGE VIT DANS TIQUIZ, ET IL N'Y A QU'UN SEUL ECRAN.
            Ventes, abonnes, departs, affiliees : tout est la-bas, pour
            les deux apps. Sans ce raccourci il faudrait retenir une
            adresse, et un ecran qu'on ne trouve pas n'existe pas (drame
            Jocelyne, 3 aout). Cette page est deja reservee a l'admin. */}
        <a
          href="https://quiz.tipote.com/admin"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Ventes, abonnés et affiliées
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            quiz.tipote.com/admin
          </code>
        </a>
      </div>

      <AdminUsersPageClient adminEmail={userEmail} />
    </AppShell>
  );
}
