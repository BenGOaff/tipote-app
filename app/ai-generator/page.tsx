// app/ai-generator/page.tsx
// Page Génération IA : paramètres + zone de résultat + templates rapides

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export default async function AIGeneratorPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        {/* Titre */}
        <header>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
            Génération IA
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Crée des contenus alignés à ta stratégie en quelques secondes.
          </p>
        </header>

        {/* Bandeau violet */}
        <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-[#b042b4] to-[#6b21a8] p-[1px] shadow-sm">
          <div className="rounded-[10px] bg-slate-900/95 px-4 py-4 text-slate-50 md:px-6">
            <h2 className="text-sm font-semibold">
              Crée des contenus engageants en quelques secondes
            </h2>
            <p className="mt-1 text-xs md:text-sm text-slate-200">
              Tipote utilisera ta stratégie, ton persona et tes offres pour générer
              des contenus cohérents, prêts à être publiés.
            </p>
          </div>
        </section>

        {/* Deux colonnes : paramètres + résultat */}
        <section className="grid gap-4 lg:grid-cols-[1.1fr,1.5fr]">
          {/* Paramètres */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Paramètres de génération
              </h3>

              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <label className="mb-1 block text-slate-600">
                    Type de contenu
                  </label>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <option>Post LinkedIn</option>
                    <option>Email</option>
                    <option>Script vidéo</option>
                    <option>Article de blog</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-slate-600">
                    Objectif du contenu
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    placeholder="Ex. : générer des leads pour ton offre principale"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-slate-600">
                    Audience ciblée
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    placeholder="Ex. : freelances débutants, coaches business..."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-slate-600">
                    Angle / message clé
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    rows={3}
                    placeholder="Ce que tu veux absolument mettre en avant dans ce contenu."
                  />
                </div>

                <button className="mt-2 w-full rounded-lg bg-[#b042b4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#971f97]">
                  Générer le contenu
                </button>
              </div>
            </div>
          </div>

          {/* Contenu généré */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
            <h3 className="text-sm font-semibold text-slate-900">
              Contenu généré
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Le texte généré par l&apos;IA apparaîtra ici. Tu pourras ensuite le
              sauvegarder dans ton Content Hub.
            </p>

            <div className="mt-4 flex-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              En attente d&apos;une première génération...
            </div>
          </div>
        </section>

        {/* Templates rapides */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Templates rapides
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Bientôt, tu pourras lancer des modèles de contenu prêts à l&apos;emploi
            (posts d&apos;engagement, études de cas, annonces d&apos;offre, etc.).
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {["Post d’engagement", "Story client", "Annonce d’offre"].map(
              (label) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700"
                >
                  {label}
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
