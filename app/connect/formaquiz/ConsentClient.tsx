"use client";

// Consentement pont L'Atelier du Quiz <- Tipote. Miroir du meme ecran cote
// Tiquiz : un clic cree le code a usage unique et renvoie vers l'Atelier.
import { useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ConsentClient({ state, email }: { state: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function authorize() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/partner/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const json = await res.json();
      if (json?.redirect) {
        window.location.href = json.redirect as string;
        return;
      }
      throw new Error("no redirect");
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="flex flex-col gap-5 py-7">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BarChart3 className="size-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold">Connecter ton compte à L&apos;Atelier du Quiz</h1>
              <p className="text-sm text-muted-foreground">
                L&apos;Atelier du Quiz pourra lire tes statistiques de quiz Tipote pour suivre ta
                progression (leads captés, vues, complétions, partages). En lecture seule.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Aucune donnée personnelle de tes leads n&apos;est partagée, seulement des compteurs.
                Tu autorises avec le compte <strong>{email}</strong>.
              </span>
            </div>

            {error && (
              <p className="text-sm text-destructive">
                Un souci est survenu. Réessaie dans un instant.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button onClick={authorize} disabled={busy} size="lg">
                {busy ? "Un instant..." : "Autoriser et connecter"}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="https://quizing.tipote.com/dashboard">Annuler</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
