// app/page.tsx
// Landing page — redirects authenticated users to dashboard
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import Link from "next/link";

export default async function HomePage() {
  // If already logged in, go to dashboard
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  } catch {
    // fail-open
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tiquiz</h1>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl text-center">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Crée des quiz engageants.
            <br />
            <span className="text-muted-foreground">Capture des leads.</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Tiquiz te permet de créer des quiz interactifs, capturer des emails
            et synchroniser automatiquement tes leads avec Systeme.io.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-base font-medium hover:bg-primary/90 transition-colors"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-base font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Tiquiz. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
